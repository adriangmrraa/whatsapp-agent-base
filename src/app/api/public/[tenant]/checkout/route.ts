import { NextRequest, NextResponse } from "next/server";
import { createStructuredOrder, type CheckoutInput } from "@/lib/storefront";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import logger from "@/lib/logger";

// ─── Public structured checkout ──────────────────────────────────────────────
//
// Unauthenticated. Prices are ALWAYS read server-side from the tenant's catalog;
// the request only carries product ids + quantities. Idempotent on (tenant,
// requestId). Returns a receipt with the WEB:<ref> the customer brings back to
// the agent.

export const dynamic = "force-dynamic";

const BAD_REQUEST = new Set([
  "invalid_request_id",
  "empty_cart",
  "too_many_items",
  "invalid_item",
  "invalid_quantity",
]);
const CONFLICT = new Set([
  "product_not_found",
  "product_unavailable",
  "price_unavailable",
  "out_of_stock",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = await checkRateLimit(`public-checkout:${ip}`).catch(() => null);
    if (rate && !rate.success) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }

    const { tenant } = await params;
    const body = (await req.json().catch(() => null)) as
      | (Partial<CheckoutInput> & { items?: unknown })
      | null;
    if (!body) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const outcome = await createStructuredOrder({
      slug: tenant,
      requestId: String(body.requestId ?? ""),
      items: Array.isArray(body.items)
        ? (body.items as CheckoutInput["items"])
        : [],
      customerName: typeof body.customerName === "string" ? body.customerName : undefined,
      phoneNumber: typeof body.phoneNumber === "string" ? body.phoneNumber : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
      orderType: typeof body.orderType === "string" ? body.orderType : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    if (!outcome.ok) {
      const status = BAD_REQUEST.has(outcome.error)
        ? 400
        : outcome.error === "unknown_tenant"
          ? 404
          : CONFLICT.has(outcome.error)
            ? 409
            : 500;
      return NextResponse.json(
        { error: outcome.error, details: outcome.details },
        { status },
      );
    }

    return NextResponse.json(outcome.receipt, { status: 201 });
  } catch (error) {
    logger.error({ error }, "[api:public/checkout] failed");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
