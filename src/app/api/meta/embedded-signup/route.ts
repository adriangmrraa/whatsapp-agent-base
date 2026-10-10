import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/tenants";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  provisionMetaAssets,
} from "@/lib/meta/oauth";
import { setCredential } from "@/lib/credentials";
import logger from "@/lib/logger";

// ─── Meta Embedded Signup ────────────────────────────────────────────────────
//
// POST /api/meta/embedded-signup — admin session required.
//
// The browser widget (Facebook JS SDK `FB.login` with the app's `config_id`)
// hands back a short-lived `code`. This route exchanges it, upgrades to a
// long-lived token, discovers the WABA + phone numbers, subscribes the app and
// registers the tenant's channels — the SAME discovery + subscribe path used by
// the OAuth callback (`provisionMetaAssets`).
//
// The token is stored encrypted per tenant and NEVER returned to the client.
// Account-level approvals (Meta App Review, a verified business, a public HTTPS
// callback) remain manual — see docs/meta-embedded-signup.md.

interface EmbeddedSignupBody {
  code?: unknown;
  redirectUri?: unknown;
}

export async function POST(req: NextRequest) {
  let tenantId: number;
  try {
    tenantId = await requireTenantId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EmbeddedSignupBody;
  try {
    body = (await req.json()) as EmbeddedSignupBody;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const redirectUri =
    typeof body.redirectUri === "string" && body.redirectUri.trim().length > 0
      ? body.redirectUri.trim()
      : undefined;

  try {
    const short = await exchangeCodeForToken({ tenantId, code, redirectUri });
    const long = await getLongLivedToken({
      tenantId,
      accessToken: short.accessToken,
    });

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

    const { assets, channels } = await provisionMetaAssets({
      tenantId,
      accessToken: long.accessToken,
    });

    return NextResponse.json({
      ok: true,
      businessName:
        assets[0]?.verifiedName ?? assets[0]?.wabaName ?? null,
      channels,
    });
  } catch (error) {
    // Never surface provider bodies or the token.
    logger.error({ error, tenantId }, "[meta:embedded-signup] failed");
    return NextResponse.json(
      { error: "Embedded signup failed — check app credentials and the code" },
      { status: 500 },
    );
  }
}
