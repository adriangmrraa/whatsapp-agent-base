import { NextRequest, NextResponse } from "next/server";
import { getStorefrontBySlug } from "@/lib/storefront";
import logger from "@/lib/logger";

// ─── Public storefront catalog ───────────────────────────────────────────────
//
// Unauthenticated read of one tenant's public storefront (identity + available
// products), resolved by slug. Tenant-scoped once the slug resolves; no global
// singleton. This is what the landing page, digital menu and cart all read.

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant } = await params;
    const storefront = await getStorefrontBySlug(tenant);
    if (!storefront) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(storefront);
  } catch (error) {
    logger.error({ error }, "[api:public/catalog] failed");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
