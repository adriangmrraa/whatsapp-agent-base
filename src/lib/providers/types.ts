// ─── Provider abstraction ───────────────────────────────────────────────────
//
// Every messaging source (YCloud, Meta Cloud API, Chatwoot, Telegram)
// implements this contract. The webhook layer stays provider-agnostic: it
// verifies the signature, parses the payload into NormalizedInbound, and
// hands it to the channel router — which never knows who produced it.

export type ChannelProvider = "ycloud" | "meta" | "telegram" | "chatwoot";

export type InboundKind = "text" | "image" | "audio" | "document" | "video" | "sticker" | "location";

export interface InboundMedia {
  kind: InboundKind;
  /** Provider media id (preferred for fetch-by-id providers like Meta). */
  providerMediaId?: string;
  /** Direct URL when the provider exposes one (YCloud). */
  url?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  /** location payloads */
  latitude?: number;
  longitude?: number;
}

/** Provider-agnostic inbound message after parsing + normalization. */
export interface NormalizedInbound {
  provider: ChannelProvider;
  /** Provider-side message id — used for dedup. */
  messageId: string;
  /** Customer identity (phone for WhatsApp, chat id for Telegram). */
  externalUserId: string;
  /** Human-readable sender name when the provider sends one. */
  senderName?: string;
  /** Identity of the tenant-facing endpoint this arrived on (the "to"). */
  channelExternalId?: string;
  kind: InboundKind;
  text?: string;
  media?: InboundMedia;
  /** Raw provider payload for forensics — never rendered to the customer. */
  raw?: unknown;
}

export interface SendResult {
  ok: boolean;
  /** Provider-side message id for the outbound message. */
  providerMessageId?: string;
  error?: string;
}

export interface OutboundText {
  kind: "text";
  text: string;
}

export interface OutboundMedia {
  kind: "image" | "document" | "video" | "audio";
  url: string;
  caption?: string;
  fileName?: string;
}

export type OutboundPayload = OutboundText | OutboundMedia;

export interface ProviderCredentials {
  /** Decrypted credential map — keys are provider-specific. */
  [key: string]: string;
}

/**
 * What every inbound webhook needs from a provider adapter BEFORE doing
 * any work: verify authenticity, then normalize.
 */
export interface InboundProvider {
  readonly provider: ChannelProvider;

  /** Verify the webhook signature/token against the raw body + headers. */
  verifySignature(input: {
    rawBody: string;
    headers: Headers;
    credentials: ProviderCredentials;
  }): Promise<boolean>;

  /** Decide if this payload is protocol noise (status, echoes) worth dropping. */
  isNoise?(payload: unknown): boolean;

  /** Normalize the provider payload into zero or more inbound messages. */
  parseInbound(payload: unknown): NormalizedInbound[];
}

/** Outbound side — what the channel router calls when replying. */
export interface OutboundProvider {
  readonly provider: ChannelProvider;
  send(input: {
    credentials: ProviderCredentials;
    channelExternalId: string; // the "from"
    to: string;
    payload: OutboundPayload;
    /** Channel row config (e.g. { channel: "messenger" }) for adapters that
     *  serve several endpoint families behind one provider. */
    channelConfig?: Record<string, unknown>;
  }): Promise<SendResult>;
}

export interface MessagingProvider extends InboundProvider, OutboundProvider {}
