import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentConfig, orders, products } from "@/db/schema";
import { resolvePublicTenant } from "./catalog";
import { buildWebOrderReference } from "./reference";
import logger from "@/lib/logger";

// ─── Structured checkout (server-priced, tenant-scoped) ──────────────────────
//
// The public storefront posts a cart; this module turns it into a structured
// `orders` row WITHOUT trusting any client-supplied price. Every price is read
// from the tenant's own catalog, the total is computed here, stock is checked
// and decremented, and the write is idempotent on (tenant, requestId). The
// returned receipt carries the `WEB:<ref>` the customer brings back to the
// agent for confirmation.

export interface CheckoutItemInput {
  productId: number;
  quantity: number;
  variant?: string;
}

export interface CheckoutInput {
  slug: string;
  /** Client idempotency key — retrying the same key never double-orders. */
  requestId: string;
  items: CheckoutItemInput[];
  customerName?: string;
  phoneNumber?: string;
  address?: string;
  orderType?: string;
  notes?: string;
}

export interface StructuredOrderReceipt {
  orderId: number;
  reference: string;
  total: number;
  whatsappUrl: string | null;
  /** True when the requestId matched an existing order (idempotent replay). */
  reused: boolean;
}

export type CheckoutOutcome =
  | { ok: true; receipt: StructuredOrderReceipt }
  | { ok: false; error: string; details?: Record<string, unknown> };

const MAX_ITEMS = 50;
const MAX_QTY = 99;

function toDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function buildWhatsappUrl(
  number: string | null,
  reference: string,
  total: number,
): string | null {
  const digits = number ? toDigits(number) : "";
  if (!digits) return null;
  const text = `Hola, quiero confirmar mi pedido web. Referencia ${reference}. Total: $${total.toFixed(2)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

interface PricedLine {
  productId: number;
  productName: string;
  quantity: number;
  variant: string | null;
  unitPrice: number;
  lineTotal: number;
  /** null = unlimited stock. */
  stockRequiresDecrement: boolean;
}

/**
 * Creates a structured order from a storefront cart. Idempotent on
 * (tenant, requestId): a replay returns the same receipt, never a second order.
 */
export async function createStructuredOrder(
  input: CheckoutInput,
): Promise<CheckoutOutcome> {
  const requestId = input.requestId?.trim();
  if (!requestId || requestId.length > 64) {
    return { ok: false, error: "invalid_request_id" };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "empty_cart" };
  }
  if (input.items.length > MAX_ITEMS) {
    return { ok: false, error: "too_many_items" };
  }

  const tenant = await resolvePublicTenant(input.slug);
  if (!tenant) return { ok: false, error: "unknown_tenant" };
  const { tenantId } = tenant;

  // ── Idempotent replay: same requestId → same order ──────────────────────
  const [existing] = await db
    .select({
      id: orders.id,
      webRef: orders.webRef,
      total: orders.total,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.requestId, requestId)))
    .limit(1);
  if (existing) {
    const total = existing.total ? Number(existing.total) : 0;
    const reference = existing.webRef ?? buildWebOrderReference();
    const number = await getPublicWhatsappNumber(tenantId);
    return {
      ok: true,
      receipt: {
        orderId: existing.id,
        reference,
        total,
        whatsappUrl: buildWhatsappUrl(number, reference, total),
        reused: true,
      },
    };
  }

  // ── Validate + price server-side ────────────────────────────────────────
  const normalized = input.items.map((item) => ({
    productId: Number(item.productId),
    quantity: Number(item.quantity),
    variant: item.variant?.trim() || null,
  }));
  for (const item of normalized) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      return { ok: false, error: "invalid_item", details: { productId: item.productId } };
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QTY) {
      return { ok: false, error: "invalid_quantity", details: { productId: item.productId } };
    }
  }

  const ids = [...new Set(normalized.map((item) => item.productId))];
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      promoPrice: products.promoPrice,
      isPromo: products.isPromo,
      available: products.available,
      stock: products.stock,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const lines: PricedLine[] = [];
  for (const item of normalized) {
    const product = byId.get(item.productId);
    if (!product) {
      return { ok: false, error: "product_not_found", details: { productId: item.productId } };
    }
    if (!product.available) {
      return { ok: false, error: "product_unavailable", details: { productId: item.productId } };
    }
    const unitPrice = Number(
      product.isPromo && product.promoPrice ? product.promoPrice : product.price,
    );
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: "price_unavailable", details: { productId: item.productId } };
    }
    lines.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      variant: item.variant,
      unitPrice,
      lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
      stockRequiresDecrement: product.stock != null,
    });
  }

  const total = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));

  // ── Stock: conditional decrement with compensating rollback ─────────────
  // (Neon HTTP has no interactive transaction; each decrement is an atomic
  // guarded UPDATE and a failure rolls back everything already decremented.)
  const decremented: { id: number; quantity: number }[] = [];
  const rollback = async () => {
    for (const applied of decremented) {
      await db
        .update(products)
        .set({ stock: sql`${products.stock} + ${applied.quantity}` })
        .where(and(eq(products.id, applied.id), eq(products.tenantId, tenantId)));
    }
  };

  for (const line of lines) {
    if (!line.stockRequiresDecrement) continue;
    const updated = await db
      .update(products)
      .set({ stock: sql`${products.stock} - ${line.quantity}` })
      .where(
        and(
          eq(products.id, line.productId),
          eq(products.tenantId, tenantId),
          sql`${products.stock} >= ${line.quantity}`,
        ),
      )
      .returning({ id: products.id });
    if (updated.length === 0) {
      await rollback();
      return { ok: false, error: "out_of_stock", details: { productId: line.productId } };
    }
    decremented.push({ id: line.productId, quantity: line.quantity });
  }

  // ── Persist the order (idempotent on requestId) ─────────────────────────
  const reference = buildWebOrderReference();
  const inserted = await db
    .insert(orders)
    .values({
      tenantId,
      requestId,
      webRef: reference,
      total: total.toFixed(2),
      source: "web",
      status: "pending",
      phoneNumber: input.phoneNumber?.trim() || "",
      customerName: input.customerName?.trim() || null,
      address: input.address?.trim() || null,
      orderType: input.orderType?.trim() || "web",
      notes: input.notes?.trim() || null,
      items: lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        variant: line.variant,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    })
    .onConflictDoNothing({
      target: [orders.tenantId, orders.requestId],
    })
    .returning({ id: orders.id });

  if (inserted.length === 0) {
    // Lost a race on the same requestId — restore stock and return the winner.
    await rollback();
    const [winner] = await db
      .select({ id: orders.id, webRef: orders.webRef, total: orders.total })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.requestId, requestId)))
      .limit(1);
    if (!winner) return { ok: false, error: "checkout_conflict" };
    const winnerTotal = winner.total ? Number(winner.total) : 0;
    const winnerRef = winner.webRef ?? reference;
    const number = await getPublicWhatsappNumber(tenantId);
    return {
      ok: true,
      receipt: {
        orderId: winner.id,
        reference: winnerRef,
        total: winnerTotal,
        whatsappUrl: buildWhatsappUrl(number, winnerRef, winnerTotal),
        reused: true,
      },
    };
  }

  logger.info(
    { tenantId, orderId: inserted[0].id, total, reference },
    "[storefront] structured order created",
  );

  const number = await getPublicWhatsappNumber(tenantId);
  return {
    ok: true,
    receipt: {
      orderId: inserted[0].id,
      reference,
      total,
      whatsappUrl: buildWhatsappUrl(number, reference, total),
      reused: false,
    },
  };
}

/** Public WhatsApp number the agent hands the confirmation to. */
export async function getPublicWhatsappNumber(
  tenantId: number,
): Promise<string | null> {
  const [cfg] = await db
    .select({
      webOrderWhatsappNumber: agentConfig.webOrderWhatsappNumber,
      whatsappBotNumber: agentConfig.whatsappBotNumber,
      deliveryPhoneNumber: agentConfig.deliveryPhoneNumber,
    })
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId))
    .limit(1);
  return (
    cfg?.webOrderWhatsappNumber?.trim() ||
    cfg?.whatsappBotNumber?.trim() ||
    cfg?.deliveryPhoneNumber?.trim() ||
    process.env.WHATSAPP_PHONE_NUMBER?.trim() ||
    null
  );
}
