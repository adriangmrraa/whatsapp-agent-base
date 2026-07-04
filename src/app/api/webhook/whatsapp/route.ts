import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/infra/rate-limit";
import { verifyYCloudSignature } from "@/lib/ycloud/webhook";
import { addToBuffer } from "@/lib/ycloud/buffer";
import { storeMedia } from "@/lib/ycloud/media";
import { captureOrUpdateLead } from "@/lib/ycloud/lead";
import {
  getOrCreateConversation,
  loadConversation,
  saveMessage,
} from "@/lib/ycloud/conversation";
import { normalizePhone } from "@/lib/ycloud/phone";
import { sendText, sendImage, sendDocument } from "@/lib/ycloud";
import logger from "@/lib/logger";
import { runWhatsAppAgent } from "@/lib/whatsapp/agent";
import type {
  YCloudWebhookEvent,
  YCloudInboundMessage,
  MediaTypes,
} from "@/lib/ycloud/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Extract the media URL from the YCloud inbound message by type.
 */
function getMediaUrl(
  msg: YCloudInboundMessage,
): { type: MediaTypes; url: string } | null {
  const mediaMap: Record<string, MediaTypes> = {
    image: "image",
    audio: "audio",
    document: "document",
    video: "video",
    sticker: "sticker",
  };

  const mediaType = mediaMap[msg.type];
  if (!mediaType) return null;

  const container =
    msg.image ?? msg.audio ?? msg.document ?? msg.video ?? msg.sticker;
  const url = container?.media?.[0]?.url;
  if (!url) return null;

  return { type: mediaType, url };
}

/**
 * Build a user-facing content string and attributes for non-text messages.
 */
function buildMediaContent(
  msg: YCloudInboundMessage,
): { content: string; contentAttributes: Record<string, unknown>[] } {
  const mediaUrl = getMediaUrl(msg);

  const attributes: Record<string, unknown>[] = [];
  if (mediaUrl) {
    const attr: Record<string, unknown> = {
      type: mediaUrl.type,
      url: mediaUrl.url,
    };
    if (msg.caption) attr.caption = msg.caption;
    if (msg.fileName) attr.fileName = msg.fileName;
    if (msg.mimeType) attr.mimeType = msg.mimeType;
    if (msg.fileSize != null) attr.fileSize = msg.fileSize;
    attributes.push(attr);
  }

  // Use caption as content if available, otherwise a descriptive placeholder
  const content = msg.caption ?? msg.text?.body ?? `[${capitalize(mediaUrl?.type ?? msg.type)}]`;

  return { content, contentAttributes: attributes };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET — health-check endpoint, also used by YCloud for webhook verification.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

/**
 * POST — process inbound WhatsApp messages from YCloud.
 *
 * Flow: rate-limit check → signature verify → parse → filter event type →
 * normalize phone → upsert lead → get/create conversation → save message →
 * (if media) store attachment metadata → add to buffer → return 200.
 *
 * The heavy processing is fire-and-forget (return 200 before awaiting).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Rate limiting ──────────────────────────────────────────────────
  const ip = getClientIp(req);

  let rateCheck: { success: boolean; remaining: number; limit: number } | null =
    null;
  try {
    rateCheck = await checkRateLimit(`whatsapp-webhook:${ip}`);
  } catch {
    // Rate limiter unavailable (missing env vars) — allow through
  }

  if (rateCheck && !rateCheck.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: getRateLimitHeaders(false, 0, rateCheck.limit),
      },
    );
  }

  // ── 2. Read raw body for signature verification ───────────────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  // ── 3. Verify HMAC-SHA256 signature ───────────────────────────────────
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] YCLOUD_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const signatureHeader = req.headers.get("ycloud-signature");
  const isValid = await verifyYCloudSignature(rawBody, signatureHeader, secret);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // ── 4. Parse JSON payload ─────────────────────────────────────────────
  let event: YCloudWebhookEvent;
  try {
    event = JSON.parse(rawBody) as YCloudWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  // ── 5. Filter: only handle inbound message events ─────────────────────
  if (event.type !== "whatsapp.inbound_message.received") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const inboundMsg = event.whatsappInboundMessage;
  if (!inboundMsg?.from) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 6. Fire-and-forget processing ─────────────────────────────────────
  void processInboundMessage(inboundMsg, secret);

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── Async Processing ─────────────────────────────────────────────────────────

async function processInboundMessage(
  msg: YCloudInboundMessage,
  _secret: string,
): Promise<void> {
  try {
    const phone = normalizePhone(msg.from);
    const customerName = msg.customerProfile?.name;
    const isText = msg.type === "text";

    // ── Upsert lead ────────────────────────────────────────────────────
    const firstMessage = msg.text?.body ?? msg.caption ?? `[${capitalize(msg.type)}]`;

    const leadId = await captureOrUpdateLead(phone, {
      name: customerName,
      firstMessage,
    });

    // ── Get / create conversation ───────────────────────────────────────
    const conversationId = await getOrCreateConversation(phone, {
      customerName,
    });

    if (isText) {
      // ── Text message ──────────────────────────────────────────────────
      const content = msg.text?.body ?? "";
      if (!content) return;

      const messageId = await saveMessage(conversationId, "user", content, {
        platformMessageId: msg.id,
      });

      addToBuffer(phone, content, async (_phone, combinedText) => {
        logger.info(
          { phone: _phone },
          "[webhook:buffer] Flush — calling WhatsApp agent",
        );

        try {
          // 1. Load conversation context from DB
          const convMessages = await loadConversation(conversationId);

          // Build messages array: full history + latest combined user text
          const agentMessages: Array<{
            role: "user" | "assistant";
            content: string;
          }> = [
            ...convMessages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user", content: combinedText },
          ];

          // 2. Run the WhatsApp agent
          const result = await runWhatsAppAgent({
            conversationId,
            customerPhone: _phone,
            messages: agentMessages,
          });

          // 3. Send response text
          const textResult = await sendText(_phone, result.text);
          if (!textResult.ok) {
            logger.error(
              { error: textResult.error },
              "[webhook:buffer] Failed to send text response",
            );
          }

          // 4. Send any pending media after the text
          for (const media of result.pendingMedia) {
            if (media.type === "image") {
              await sendImage(_phone, media.url, media.caption);
            } else if (media.type === "document") {
              await sendDocument(_phone, media.url, media.caption);
            }
            // Small delay between media messages to respect rate limits
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          logger.info(
            { phone: _phone, textLength: result.text.length, mediaCount: result.pendingMedia.length },
            "[webhook:buffer] Flush complete",
          );
        } catch (error) {
          logger.error({ error }, "[webhook:buffer] Flush handler error");
        }
      });
    } else {
      // ── Media message (image / audio / document / video / sticker) ────
      const { content, contentAttributes } = buildMediaContent(msg);

      const messageId = await saveMessage(conversationId, "user", content, {
        platformMessageId: msg.id,
        contentAttributes,
      });

      // Persist attachment record
      const mediaInfo = getMediaUrl(msg);
      if (mediaInfo) {
        await storeMedia({
          leadId,
          conversationId,
          messageId,
          type: mediaInfo.type,
          url: mediaInfo.url,
          fileName: msg.fileName ?? null,
          mimeType: msg.mimeType ?? null,
          fileSize: msg.fileSize ?? null,
          caption: msg.caption ?? null,
        });
      }
    }
  } catch (error) {
    console.error("[webhook] Error processing inbound message:", error);
  }
}
