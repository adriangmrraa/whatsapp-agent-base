import { NextRequest, NextResponse } from "next/server";
import {
  parseOAuthState,
  exchangeCodeForToken,
  getLongLivedToken,
  discoverWabas,
  subscribeWaba,
} from "@/lib/meta/oauth";
import { setCredential } from "@/lib/credentials";
import { ensureChannel, getAgentConfig } from "@/lib/tenants";
import { db } from "@/db";
import { agentConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import logger from "@/lib/logger";

// ─── Meta OAuth callback ─────────────────────────────────────────────────────
//
// Meta redirects here with ?code&state after the tenant admin consents.
// state = "<tenantId>.<nonce>" — the nonce is also stored as an httpOnly
// cookie on connect-start to prevent CSRF.

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const base = req.nextUrl.origin;

  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/admin/agent?meta_error=${encodeURIComponent(reason)}`);

  if (!code || !state) return fail("missing_code_or_state");

  const parsed = parseOAuthState(state);
  if (!parsed) return fail("invalid_state");

  const cookieNonce = req.cookies.get("meta_oauth_state")?.value;
  if (!cookieNonce || cookieNonce !== parsed.nonce) {
    return fail("state_mismatch");
  }

  const tenantId = parsed.tenantId;
  const redirectUri = `${base}/api/meta/callback`;

  try {
    const short = await exchangeCodeForToken({ tenantId, code, redirectUri });
    const long = await getLongLivedToken({ tenantId, accessToken: short.accessToken });

    // Persist the long-lived token (AES-256 at rest).
    await setCredential({
      tenantId,
      provider: "meta",
      key: "access_token",
      value: long.accessToken,
    });
    await setCredential({
      tenantId,
      provider: "meta",
      key: "token_expires_at",
      value: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
    });

    // Discover WABA + phone numbers; register channels per phone number.
    const assets = await discoverWabas(long.accessToken);
    for (const asset of assets) {
      await subscribeWaba({ wabaId: asset.wabaId, accessToken: long.accessToken });
      await ensureChannel({
        tenantId,
        provider: "meta",
        externalId: asset.phoneNumberId,
        displayName: asset.verifiedName ?? asset.displayPhoneNumber,
        config: {
          wabaId: asset.wabaId,
          wabaName: asset.wabaName,
          displayPhoneNumber: asset.displayPhoneNumber,
        },
      });
    }

    // Mark config as connected.
    const cfg = await getAgentConfig(tenantId);
    const first = assets[0];
    if (cfg) {
      await db
        .update(agentConfig)
        .set({
          metaConnected: true,
          metaWabaId: first?.wabaId ?? null,
          metaPhoneNumberId: first?.phoneNumberId ?? null,
          metaBusinessName: first?.verifiedName ?? first?.wabaName ?? null,
          updatedAt: new Date(),
        })
        .where(eq(agentConfig.tenantId, tenantId));
    }

    const res = NextResponse.redirect(`${base}/admin/agent?meta_connected=1`);
    res.cookies.set("meta_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (error) {
    logger.error({ error, tenantId }, "[meta:callback] failed");
    return fail("exchange_failed");
  }
}
