import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { getCredential } from "@/lib/credentials";
import { db } from "@/db";
import { agentConfig } from "@/db/schema";
import { ensureChannel, getAgentConfig } from "@/lib/tenants";
import { META_GRAPH_BASE, META_OAUTH_DIALOG, META_OAUTH_SCOPES } from "./config";

// ─── Meta OAuth + WABA discovery (per tenant) ────────────────────────────────
//
// Flow: admin clicks Connect → buildOAuthUrl → Meta consent → callback with
// ?code → exchangeCodeForToken → longLivedToken → discover WABA + phone
// numbers → store encrypted credentials + register channel row.

export function generateOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export async function buildOAuthUrl(input: {
  tenantId: number;
  redirectUri: string;
  state: string;
}): Promise<string> {
  const appId = await getCredential({
    tenantId: input.tenantId,
    provider: "meta",
    key: "app_id",
    envFallback: process.env.META_APP_ID ?? "",
  });
  if (!appId) throw new Error("Meta app_id is not configured for this tenant");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: input.redirectUri,
    scope: META_OAUTH_SCOPES,
    response_type: "code",
    state: `${input.tenantId}.${input.state}`,
  });
  return `${META_OAUTH_DIALOG}?${params}`;
}

export function parseOAuthState(state: string): { tenantId: number; nonce: string } | null {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const tenantId = parseInt(state.slice(0, dot), 10);
  const nonce = state.slice(dot + 1);
  if (!Number.isInteger(tenantId) || tenantId < 1 || nonce.length < 16) return null;
  return { tenantId, nonce };
}

export async function exchangeCodeForToken(input: {
  tenantId: number;
  code: string;
  /** Omitted for Embedded Signup, which exchanges the code without a redirect. */
  redirectUri?: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const [appId, appSecret] = await Promise.all([
    getCredential({
      tenantId: input.tenantId,
      provider: "meta",
      key: "app_id",
      envFallback: process.env.META_APP_ID ?? "",
    }),
    getCredential({
      tenantId: input.tenantId,
      provider: "meta",
      key: "app_secret",
      envFallback: process.env.META_APP_SECRET ?? "",
    }),
  ]);
  if (!appId || !appSecret) {
    throw new Error("Meta app credentials are not configured for this tenant");
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code: input.code,
  });
  if (input.redirectUri) params.set("redirect_uri", input.redirectUri);

  const resp = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Meta token exchange failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 0 };
}

/** Exchanges a short-lived token for a ~60-day long-lived token. */
export async function getLongLivedToken(input: {
  tenantId: number;
  accessToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const [appId, appSecret] = await Promise.all([
    getCredential({
      tenantId: input.tenantId,
      provider: "meta",
      key: "app_id",
      envFallback: process.env.META_APP_ID ?? "",
    }),
    getCredential({
      tenantId: input.tenantId,
      provider: "meta",
      key: "app_secret",
      envFallback: process.env.META_APP_SECRET ?? "",
    }),
  ]);
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: input.accessToken,
  });
  const resp = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    // Fall back to the short-lived token if exchange fails — caller still proceeds.
    return { accessToken: input.accessToken, expiresIn: 3600 };
  }
  const data = (await resp.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 0 };
}

export interface WabaAsset {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName?: string;
}

/** Discovers WhatsApp Business Accounts + phone numbers reachable by the token. */
export async function discoverWabas(accessToken: string): Promise<WabaAsset[]> {
  // 1. Businesses the user can access
  const bizResp = await fetch(
    `${META_GRAPH_BASE}/me/businesses?fields=id,name&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!bizResp.ok) return [];
  const biz = (await bizResp.json()) as { data?: { id: string; name: string }[] };

  const assets: WabaAsset[] = [];
  for (const business of biz.data ?? []) {
    const wabaResp = await fetch(
      `${META_GRAPH_BASE}/${business.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!wabaResp.ok) continue;
    const wabas = (await wabaResp.json()) as { data?: { id: string; name: string }[] };

    for (const waba of wabas.data ?? []) {
      const phonesResp = await fetch(
        `${META_GRAPH_BASE}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!phonesResp.ok) continue;
      const phones = (await phonesResp.json()) as {
        data?: { id: string; display_phone_number: string; verified_name?: string }[];
      };
      for (const phone of phones.data ?? []) {
        assets.push({
          wabaId: waba.id,
          wabaName: waba.name ?? business.name,
          phoneNumberId: phone.id,
          displayPhoneNumber: phone.display_phone_number,
          verifiedName: phone.verified_name,
        });
      }
    }
  }
  return assets;
}

/** Subscribes the app to a WABA's webhooks (required to receive messages). */
export async function subscribeWaba(input: {
  wabaId: string;
  accessToken: string;
}): Promise<boolean> {
  const resp = await fetch(
    `${META_GRAPH_BASE}/${input.wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: input.accessToken }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  return resp.ok;
}

/** Unsubscribes the app from a WABA (disconnect cleanup). */
export async function unsubscribeWaba(input: {
  wabaId: string;
  accessToken: string;
}): Promise<boolean> {
  const resp = await fetch(
    `${META_GRAPH_BASE}/${input.wabaId}/subscribed_apps`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: input.accessToken }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  return resp.ok;
}

export interface ProvisionedMetaChannel {
  phoneNumberId: string;
  wabaId: string;
  wabaName: string;
  displayPhoneNumber: string;
  displayName: string;
}

export interface ProvisionMetaResult {
  assets: WabaAsset[];
  channels: ProvisionedMetaChannel[];
}

/**
 * Shared post-token provisioning for every Meta connect flow (OAuth callback
 * and Embedded Signup). Given a valid access token it discovers the reachable
 * WABAs + phone numbers, subscribes the app to each WABA, registers the
 * tenant's `channels` rows, and marks the agent config connected. Idempotent:
 * `ensureChannel` upserts by (provider, externalId).
 *
 * Never returns or logs the token.
 */
export async function provisionMetaAssets(input: {
  tenantId: number;
  accessToken: string;
}): Promise<ProvisionMetaResult> {
  const assets = await discoverWabas(input.accessToken);

  for (const asset of assets) {
    await subscribeWaba({ wabaId: asset.wabaId, accessToken: input.accessToken });
    await ensureChannel({
      tenantId: input.tenantId,
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

  const cfg = await getAgentConfig(input.tenantId);
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
      .where(eq(agentConfig.tenantId, input.tenantId));
  }

  return {
    assets,
    channels: assets.map((asset) => ({
      phoneNumberId: asset.phoneNumberId,
      wabaId: asset.wabaId,
      wabaName: asset.wabaName,
      displayPhoneNumber: asset.displayPhoneNumber,
      displayName: asset.verifiedName ?? asset.displayPhoneNumber,
    })),
  };
}

export function encryptToken(token: string): string {
  return encrypt(token);
}
