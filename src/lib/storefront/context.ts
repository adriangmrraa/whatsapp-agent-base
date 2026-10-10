import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { extractWebOrderReference } from "./reference";

// ─── Pre-agent structured order context ──────────────────────────────────────
//
// The bridge that makes "the order arrives already structured". When an inbound
// message carries a `WEB:<ref>`, the order is fetched and injected into the
// model's context as exact, server-priced facts — the LLM confirms the order,
// it does not reconstruct it from free text. Detection lives here (not inside
// the customer prompt) so it can move behind System One without changing the
// agent. System One's own files are owned elsewhere; this is the seam's data.

interface OrderLine {
  productName?: string;
  quantity?: number;
  variant?: string | null;
}

export interface StructuredOrderSummary {
  orderId: number;
  reference: string;
  status: string;
  total: number;
  customerName: string | null;
  address: string | null;
  items: OrderLine[];
}

/** Fetches a structured order by its WEB:<ref>, tenant-scoped. */
export async function getStructuredOrderByReference(
  tenantId: number,
  reference: string,
): Promise<StructuredOrderSummary | null> {
  const normalized = reference?.trim();
  if (!normalized) return null;
  const [row] = await db
    .select({
      id: orders.id,
      webRef: orders.webRef,
      status: orders.status,
      total: orders.total,
      customerName: orders.customerName,
      address: orders.address,
      items: orders.items,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.webRef, normalized)))
    .limit(1);
  if (!row) return null;

  const items = Array.isArray(row.items) ? (row.items as OrderLine[]) : [];
  return {
    orderId: row.id,
    reference: row.webRef ?? normalized,
    status: row.status,
    total: row.total ? Number(row.total) : 0,
    customerName: row.customerName,
    address: row.address,
    items,
  };
}

function formatOrder(summary: StructuredOrderSummary): string {
  const lines = summary.items
    .map((line) => {
      const qty = line.quantity ?? 1;
      const variant = line.variant ? ` (${line.variant})` : "";
      return `- ${qty}x ${line.productName ?? "item"}${variant}`;
    })
    .join("\n");
  const address = summary.address ? `\nDelivery address: ${summary.address}` : "";
  return (
    `Structured web order ${summary.reference} (order #${summary.orderId}, status ${summary.status}).\n` +
    `Total: $${summary.total.toFixed(2)}\n${lines}${address}`
  );
}

/**
 * If `text` carries a WEB:<ref>, returns a prompt block describing the exact
 * structured order. Returns null when no reference is present or it is unknown.
 */
export async function buildWebOrderContext(
  tenantId: number,
  text: string,
): Promise<string | null> {
  const reference = extractWebOrderReference(text);
  if (!reference) return null;
  const summary = await getStructuredOrderByReference(tenantId, reference).catch(
    () => null,
  );
  if (!summary) return null;
  return (
    "[A structured web order is attached to this message. Do NOT re-parse the " +
    "order from the conversation. Confirm these exact items, total and address " +
    "with the customer, then proceed.]\n" +
    formatOrder(summary)
  );
}

export { formatOrder };
