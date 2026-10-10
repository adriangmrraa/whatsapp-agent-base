import type {
  MessagingProvider,
  NormalizedInbound,
  OutboundPayload,
  ProviderCredentials,
  SendResult,
} from "./types";
import { verifyYCloudSignature } from "@/lib/ycloud/webhook";
import type { YCloudInboundMessage, YCloudWebhookEvent } from "@/lib/ycloud/types";

const YCLOUD_API_URL = "https://api.ycloud.com/v2/whatsapp/messages/sendDirectly";

function buildBody(from: string, to: string, payload: OutboundPayload): string {
  if (payload.kind === "text") {
    return JSON.stringify({
      from,
      to,
      type: "text",
      text: { body: payload.text, preview_url: false },
    });
  }
  const type = payload.kind === "document" ? "document" : payload.kind;
  return JSON.stringify({
    from,
    to,
    type,
    [type]: {
      link: payload.url,
      caption: payload.caption ?? "",
      ...(payload.kind === "document"
        ? { filename: payload.fileName ?? "document.pdf" }
        : {}),
    },
  });
}

function parseMedia(msg: YCloudInboundMessage): NormalizedInbound["media"] {
  const container =
    msg.image ?? msg.audio ?? msg.document ?? msg.video ?? msg.sticker;
  const url = container?.media?.[0]?.url;
  if (!url && msg.type !== "text") return undefined;
  const kind = (
    ["image", "audio", "document", "video", "sticker"].includes(msg.type)
      ? msg.type
      : "text"
  ) as NormalizedInbound["kind"];
  return {
    kind,
    url: url ?? undefined,
    caption: msg.caption,
    fileName: msg.fileName,
    mimeType: msg.mimeType,
    fileSize: msg.fileSize,
  };
}

export const ycloudProvider: MessagingProvider = {
  provider: "ycloud",

  async verifySignature({ rawBody, headers, credentials }) {
    const secret = credentials.webhook_secret;
    if (!secret) return false;
    return verifyYCloudSignature(
      rawBody,
      headers.get("ycloud-signature"),
      secret,
    );
  },

  isNoise(payload) {
    const event = payload as YCloudWebhookEvent;
    return event?.type !== "whatsapp.inbound_message.received";
  },

  parseInbound(payload) {
    const event = payload as YCloudWebhookEvent;
    const msg = event?.whatsappInboundMessage;
    if (!msg?.from || !msg.id) return [];

    const media = parseMedia(msg);
    const text = msg.text?.body ?? msg.caption ?? undefined;

    return [
      {
        provider: "ycloud",
        messageId: msg.id,
        externalUserId: msg.from,
        senderName: msg.customerProfile?.name,
        channelExternalId: (msg as unknown as { to?: string }).to,
        kind: media?.kind ?? "text",
        text,
        media,
        raw: msg,
      },
    ];
  },

  async send({ credentials, channelExternalId, to, payload }): Promise<SendResult> {
    const apiKey = credentials.api_key;
    const from = channelExternalId || credentials.phone_number;
    if (!apiKey || !from) {
      return { ok: false, error: "Missing ycloud api_key or phone_number" };
    }

    const body = buildBody(from, to, payload);

    for (let attempt = 0; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(YCLOUD_API_URL, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          try {
            const data = (await response.clone().json()) as { id?: string };
            return { ok: true, providerMessageId: data?.id };
          } catch {
            return { ok: true };
          }
        }

        // Never retry client errors.
        if (response.status >= 400 && response.status < 500) {
          const errorText = await response.text().catch(() => "unknown error");
          return { ok: false, error: `YCloud ${response.status}: ${errorText}` };
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        const errorText = await response.text().catch(() => "unknown error");
        return { ok: false, error: `YCloud ${response.status}: ${errorText}` };
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
