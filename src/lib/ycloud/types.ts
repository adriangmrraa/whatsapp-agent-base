export type SendTextResult =
  | { ok: true; wamid?: string }
  | { ok: false; error: string };

export interface YCloudResponse {
  id: string;
  status: string;
}

export type MediaTypes =
  | "image"
  | "audio"
  | "document"
  | "video"
  | "sticker"
  | "location";

// ─── Webhook Event Types ─────────────────────────────────────────────────────

export interface YCloudInboundMessage {
  from: string;
  type: "text" | "image" | "audio" | "document" | "video" | "sticker";
  id?: string;
  text?: { body: string };
  caption?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  customerProfile?: { name: string };
  image?: { media: Array<{ url: string }> };
  audio?: { media: Array<{ url: string }> };
  document?: { media: Array<{ url: string }> };
  video?: { media: Array<{ url: string }> };
  sticker?: { media: Array<{ url: string }> };
  /**
   * Availability — if present, describes when (24h window) the business can
   * reply without the customer having to send a new message.
   */
  availability?: { status: "available" | "expired" | "unknown" };
}

export interface YCloudWebhookEvent {
  type: string;
  whatsappInboundMessage?: YCloudInboundMessage;
}
