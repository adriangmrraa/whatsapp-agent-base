import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/tenants";
import { buildOAuthUrl, generateOAuthState } from "@/lib/meta/oauth";
import { META_OAUTH_STATE_COOKIE } from "@/lib/meta/config";
import logger from "@/lib/logger";

// ─── Meta OAuth kickoff ──────────────────────────────────────────────────────
// POST /api/meta/connect — admin session required. Returns the consent URL
// and sets the CSRF nonce cookie the callback validates.

export async function POST(req: NextRequest) {
  try {
    const tenantId = await requireTenantId();
    const nonce = generateOAuthState();
    const redirectUri = `${req.nextUrl.origin}/api/meta/callback`;
    const url = await buildOAuthUrl({ tenantId, redirectUri, state: nonce });

    const res = NextResponse.json({ url });
    res.cookies.set(META_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (error) {
    logger.error({ error }, "[meta:connect] failed");
    return NextResponse.json(
      { error: "Meta connect failed — check app credentials" },
      { status: 500 },
    );
  }
}
