import { NextRequest, NextResponse } from "next/server";
import { getProvider, loadProviderCredentials } from "@/lib/providers/registry";
import { processInbound } from "@/lib/engine/inbound-processor";
import { getDefaultTenantId, resolveChannel } from "@/lib/tenants";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import logger from "@/lib/logger";

// ─── Meta WhatsApp Cloud API webhook ─────────────────────────────────────────
//
// GET  — subscription verification (hub.mode/hub.verify_token/hub.challenge)
// POST — inbound messages; verified via X-Hub-Signature-256 (app secret).
//
// Multi-tenant POST order: parse → resolve channel by metadata.phone_number_id
// → verify signature with THAT tenant's app_secret (env fallback for bootstrap).

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  // The verify token is checked against env first, then the default tenant's
  // stored credential. (A SaaS normally runs ONE Meta app → one verify token.)
  const tenantId = (await getDefaultTenantId()) ?? 0;
  const credentials = await loadProviderCredentials(tenantId, "meta");
  const expected = credentials.webhook_verify_token;

  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = await checkRateLimit(`meta-webhook:${ip}`).catch(() => null);
    if (rate && !rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rawBody = await req.text();
    if (!rawBody) return NextResponse.json({ received: true }, { status: 200 });

    const provider = getProvider("meta");
    if (!provider) return NextResponse.json({ received: true }, { status: 200 });

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
    }

    // Parse first (untrusted — nothing is persisted yet) to extract the
    // phone_number_id that identifies the owning tenant's channel.
    const inboundMessages = provider.parseInbound(payload);
    const phoneNumberId = inboundMessages[0]?.channelExternalId;
    const channel = phoneNumberId
      ? await resolveChannel("meta", phoneNumberId)
      : null;
    const credentials = await loadProviderCredentials(
      channel?.tenantId ?? ((await getDefaultTenantId()) ?? 0),
      "meta",
    );

    const valid = await provider.verifySignature({
      rawBody,
      headers: req.headers,
      credentials,
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    for (const inbound of inboundMessages) {
      void processInbound(inbound).catch((error) =>
        logger.error({ error }, "[webhook:meta] processInbound failed"),
      );
    }
  } catch (error) {
    logger.error({ error }, "[webhook:meta] error");
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
