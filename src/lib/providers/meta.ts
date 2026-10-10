import { createHmac, timingSafeEqual } from "crypto";
import type {
  MessagingProvider,
  NormalizedInbound,
  OutboundPayload,
  SendResult,
} from "./types";
import { META_GRAPH_VERSION } from "@/lib/meta/config";

// ─── Meta WhatsApp Cloud API provider ────────────────────────────────────────
//
// Direct Meta integration — no BSP. Webhook payloads arrive as
// { entry: [{ changes: [{ field: "messages", value: {...} }] }] } with
// value.metadata.phone_number_id identifying the tenant-facing number.

interface MetaMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
}

const SUPPORTED = new Set(["text", "image", "audio", "document", "video", "sticker", "location"]);

function buildMetaBody(to: string, payload: OutboundPayload): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (payload.kind === "text") {
    return { ...base, type: "text", text: { body: payload.text, preview_url: false } };
  }
  const mediaBody: Record<string, unknown> = { link: payload.url };
  if (payload.caption) mediaBody.caption = payload.caption;
  if (payload.kind === "document" && payload.fileName) mediaBody.filename = payload.fileName;
  return { ...base, type: payload.kind, [payload.kind]: mediaBody };
}

export const metaProvider: MessagingProvider = {
  provider: "meta",

  async verifySignature({ rawBody, headers, credentials }) {
    const secret = credentials.app_secret;
    const header = headers.get("x-hub-signature-256");
    if (!secret || !header?.startsWith("sha256=")) return false;
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    return a.length === b.length && timingSafeEqual(a, b);
  },

  parseInbound(payload) {
    const out: NormalizedInbound[] = [];
    const body = payload as {
      entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[];
    };

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;
        const value = change.value as {
          metadata?: { phone_number_id?: string };
          contacts?: { profile?: { name?: string } }[];
          messages?: MetaMessage[];
        } | undefined;
        if (!value?.messages) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const contactName = value.contacts?.[0]?.profile?.name;

        for (const msg of value.messages) {
          if (!msg.id || !msg.from || !msg.type || !SUPPORTED.has(msg.type)) continue;

          const kind = msg.type as NormalizedInbound["kind"];
          const mediaNode =
            kind === "image" ? msg.image
            : kind === "audio" ? msg.audio
            : kind === "document" ? msg.document
            : kind === "video" ? msg.video
            : kind === "sticker" ? msg.sticker
            : undefined;

          out.push({
            provider: "meta",
            messageId: msg.id,
            externalUserId: msg.from,
            senderName: contactName,
            channelExternalId: phoneNumberId,
            kind,
            text: msg.text?.body ?? (mediaNode as { caption?: string } | undefined)?.caption,
            media:
              kind === "location"
                ? {
                    kind,
                    latitude: msg.location?.latitude,
                    longitude: msg.location?.longitude,
                    caption: msg.location?.name ?? msg.location?.address,
                  }
                : mediaNode
                  ? {
                      kind,
                      providerMediaId: mediaNode.id,
                      mimeType: mediaNode.mime_type,
                      fileName: (mediaNode as { filename?: string }).filename,
                      caption: (mediaNode as { caption?: string }).caption,
                    }
                  : undefined,
            raw: msg,
          });
        }
      }
    }
    return out;
  },

  async send({ credentials, channelExternalId, to, payload }): Promise<SendResult> {
    const token = credentials.access_token;
    const phoneNumberId = channelExternalId || credentials.phone_number_id;
    if (!token || !phoneNumberId) {
      return { ok: false, error: "Missing meta access_token or phone_number_id" };
    }

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
    const body = buildMetaBody(to, payload);

    for (let attempt = 0; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            messages?: { id?: string }[];
          };
          return { ok: true, providerMessageId: data.messages?.[0]?.id };
        }

        if (response.status >= 400 && response.status < 500) {
          const errorText = await response.text().catch(() => "unknown error");
          return { ok: false, error: `Meta ${response.status}: ${errorText}` };
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        const errorText = await response.text().catch(() => "unknown error");
        return { ok: false, error: `Meta ${response.status}: ${errorText}` };
      } catch (err) {
        clearTimeout(timeoutId);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        return {
          ok: false,
          error: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
    return { ok: false, error: "Max retries exceeded" };
  },
};
