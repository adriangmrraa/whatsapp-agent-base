import { createHmac, timingSafeEqual } from "crypto";
import type {
  MessagingProvider,
  NormalizedInbound,
  OutboundPayload,
  SendResult,
} from "./types";
import { META_GRAPH_BASE } from "@/lib/meta/config";

// ─── Meta provider (WhatsApp Cloud API + Messenger + Instagram) ──────────────
//
// One adapter, three endpoints sharing the same webhook + signature + Send API
// mechanics. The channel family comes from `channels.config.channel`
// ("whatsapp" | "messenger" | "instagram") — see docs/channels-meta.md.
//
//   WhatsApp Cloud : { entry: [{ changes: [{ field:"messages", value }] }] }
//                    value.metadata.phone_number_id identifies the channel.
//   Page/Instagram : { object:"page"|"instagram",
//                      entry: [{ id: <page/ig id>, messaging: [{...}] }] }
//                    entry.id identifies the channel; Send API POST /me/messages.
//
// Signatures are identical: X-Hub-Signature-256 = HMAC-SHA256(body, app_secret).

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

interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
}

const SUPPORTED = new Set(["text", "image", "audio", "document", "video", "sticker", "location"]);

type MetaChannelKind = "whatsapp" | "messenger" | "instagram";

function channelKind(config: Record<string, unknown> | undefined): MetaChannelKind {
  const value = config?.channel;
  if (value === "messenger" || value === "instagram") return value;
  return "whatsapp";
}

function attachmentKind(type: string | undefined): NormalizedInbound["kind"] | null {
  switch (type) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "file":
      return "document";
    default:
      return null;
  }
}

function buildWhatsAppBody(to: string, payload: OutboundPayload): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (payload.kind === "text") {
    return { ...base, type: "text", text: { body: payload.text, preview_url: false } };
  }
  const mediaBody: Record<string, unknown> = { link: payload.url };
  if (payload.caption) mediaBody.caption = payload.caption;
  if (payload.kind === "document" && payload.fileName) mediaBody.filename = payload.fileName;
  return { ...base, type: payload.kind, [payload.kind]: mediaBody };
}

function buildPageBody(to: string, payload: OutboundPayload): Record<string, unknown> {
  const base = { recipient: { id: to }, messaging_type: "RESPONSE" };
  if (payload.kind === "text") {
    return { ...base, message: { text: payload.text } };
  }
  const type = payload.kind === "document" ? "file" : payload.kind;
  return {
    ...base,
    message: { attachment: { type, payload: { url: payload.url, is_reusable: true } } },
  };
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

  isNoise(payload) {
    const body = payload as { entry?: unknown[] } | undefined;
    return !Array.isArray(body?.entry) || body.entry.length === 0;
  },

  parseInbound(payload) {
    const out: NormalizedInbound[] = [];
    const body = payload as {
      object?: string;
      entry?: {
        id?: string;
        changes?: { field?: string; value?: Record<string, unknown> }[];
        messaging?: MetaMessagingEvent[];
      }[];
    };

    for (const entry of body?.entry ?? []) {
      // ── Facebook Page / Instagram Messaging ────────────────────────────
      if (body?.object === "page" || body?.object === "instagram") {
        const channelExternalId = entry.id;
        if (!channelExternalId) continue;
        for (const event of entry.messaging ?? []) {
          const message = event.message;
          if (!message?.mid) continue; // delivery/read/postback carry no message
          if (message.is_echo) continue; // drop our own outbound echoes
          const senderId = event.sender?.id;
          if (!senderId || senderId === channelExternalId) continue; // never self

          const attachment = message.attachments?.[0];
          const mediaKind = attachmentKind(attachment?.type);
          const kind: NormalizedInbound["kind"] | null = message.text
            ? "text"
            : mediaKind;
          if (!kind) continue;

          out.push({
            provider: "meta",
            messageId: message.mid,
            externalUserId: senderId,
            channelExternalId,
            kind,
            text: message.text,
            media: attachment
              ? { kind, url: attachment.payload?.url }
              : undefined,
            raw: message,
          });
        }
        continue;
      }

      // ── WhatsApp Cloud API ─────────────────────────────────────────────
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;
        const value = change.value as
          | {
              metadata?: { phone_number_id?: string };
              contacts?: { profile?: { name?: string } }[];
              messages?: MetaMessage[];
            }
          | undefined;
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

  async send({
    credentials,
    channelExternalId,
    to,
    payload,
    channelConfig,
  }): Promise<SendResult> {
    const kind = channelKind(channelConfig);
    const token =
      kind === "whatsapp"
        ? credentials.access_token
        : credentials.page_access_token || credentials.access_token;

    let url: string;
    let body: Record<string, unknown>;
    if (kind === "whatsapp") {
      const phoneNumberId = channelExternalId || credentials.phone_number_id;
      if (!token || !phoneNumberId) {
        return { ok: false, error: "Missing meta access_token or phone_number_id" };
      }
      url = `${META_GRAPH_BASE}/${phoneNumberId}/messages`;
      body = buildWhatsAppBody(to, payload);
    } else {
      if (!token) {
        return { ok: false, error: `Missing meta page access token for ${kind}` };
      }
      url = `${META_GRAPH_BASE}/me/messages`;
      body = buildPageBody(to, payload);
    }

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
            message_id?: string;
          };
          return {
            ok: true,
            providerMessageId: data.messages?.[0]?.id ?? data.message_id,
          };
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
