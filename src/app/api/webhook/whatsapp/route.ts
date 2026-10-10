import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/infra/rate-limit";
import { getProvider, loadProviderCredentials } from "@/lib/providers/registry";
import { isProtocolArtifact } from "@/lib/whatsapp/webhook-pipeline";
import { processInbound } from "@/lib/engine/inbound-processor";
import { resolveChannel } from "@/lib/tenants";
import logger from "@/lib/logger";

// ─── YCloud WhatsApp webhook ─────────────────────────────────────────────────
//
// Multi-tenant order of operations matters here:
//   rate-limit → read raw body → JSON.parse → protocol artifacts
//   → parseInbound (extract channel identity, e.g. the `to` number)
//   → resolveChannel(provider, externalId) → tenant
//   → verify HMAC signature with THAT tenant's webhook secret
//   → processInbound (untrusted payload only acts after verification)
//
// Parsing before verification is safe: nothing derived from the payload is
// persisted or acted upon until the signature check passes.

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  let rateCheck: { success: boolean; remaining: number; limit: number } | null = null;
  try {
    rateCheck = await checkRateLimit(`whatsapp-webhook:${ip}`);
  } catch {
    // Rate limiter unavailable — allow through.
  }
  if (rateCheck && !rateCheck.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: getRateLimitHeaders(false, 0, rateCheck.limit) },
    );
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }
  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const provider = getProvider("ycloud");
  if (!provider) {
    return NextResponse.json({ error: "Provider unavailable" }, { status: 500 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  // Protocol artifacts (echoes, statuses) → 200, no work.
  if (isProtocolArtifact(event)) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const inboundMessages = provider.parseInbound(event);
  if (inboundMessages.length === 0) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Resolve the owning tenant from the channel identity carried in the
  // message (YCloud sends the business number in `to`). The signature is
  // verified against that tenant's webhook secret — never a global one.
  const channelExternalId = inboundMessages[0].channelExternalId;
  const channel = channelExternalId
    ? await resolveChannel("ycloud", channelExternalId)
    : null;

  // Bootstrap path: no channel row yet → the deployment's env
  // YCLOUD_WEBHOOK_SECRET still verifies (tenantId 0 = env-only lookup).
  const credentials = await loadProviderCredentials(
    channel?.tenantId ?? 0,
    "ycloud",
  );

  const isValid = await provider.verifySignature({
    rawBody,
    headers: req.headers,
    credentials,
  });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  for (const inbound of inboundMessages) {
    void processInbound(inbound).catch((error) =>
      logger.error({ error }, "[webhook:ycloud] processInbound failed"),
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
