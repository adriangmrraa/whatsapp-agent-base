import type {
  MessagingProvider,
  NormalizedInbound,
  OutboundPayload,
  SendResult,
} from "./types";
import { ChatwootClient } from "@/lib/chatwoot/client";

// ─── Chatwoot provider ───────────────────────────────────────────────────────
//
// Two roles:
//   Inbound  — human agents typing inside Chatwoot produce webhook events
//              (message_created, outgoing). parseInbound normalizes them; the
//              router forwards the text to the end customer through the
//              conversation's OWNING provider (ycloud/meta).
//   Outbound — send() mirrors our replies INTO Chatwoot so the business sees
//              a unified inbox.

interface ChatwootWebhookPayload {
  event?: string;
  message_type?: string;
  private?: boolean;
  id?: number;
  content?: string;
  content_type?: string;
  created_at?: string;
  conversation?: {
    id?: number;
    inbox_id?: number;
    meta?: { sender?: { phone_number?: string; name?: string } };
  };
  account?: { id?: number };
  sender?: { id?: number; name?: string; type?: string };
  attachments?: { file_type?: string; data_url?: string }[];
}

export const chatwootProvider: MessagingProvider = {
  provider: "chatwoot",

  // Chatwoot webhooks are shared-secret free on most installs — we verify by
  // matching account/inbox against the tenant's channel row in the route,
  // plus an optional token query param checked there.
  async verifySignature() {
    return true;
  },

  isNoise(payload) {
    const p = payload as ChatwootWebhookPayload;
    if (p?.event !== "message_created") return true;
    if (p.private) return true;
    // Only agent-authored outgoing messages are bridged out to customers.
    if (p.message_type !== "outgoing") return true;
    return false;
  },

  parseInbound(payload) {
    const p = payload as ChatwootWebhookPayload;
    const convId = p.conversation?.id;
    const phone = p.conversation?.meta?.sender?.phone_number;
    if (!convId || !p.id || !p.content) return [];

    const attachment = p.attachments?.[0];
    const hasMedia = !!attachment?.data_url;

    return [
      {
        provider: "chatwoot",
        messageId: `cw-${p.id}`,
        // The "external user" here is the Chatwoot conversation — routing to
        // the real customer happens via conversations.externalConversationId.
        externalUserId: phone ?? `cw-conv-${convId}`,
        senderName: p.sender?.name,
        channelExternalId: String(p.conversation?.inbox_id ?? ""),
        kind: hasMedia
          ? ((attachment?.file_type === "image" ? "image" : "document") as NormalizedInbound["kind"])
          : "text",
        text: p.content,
        media: hasMedia
          ? { kind: "image", url: attachment!.data_url }
          : undefined,
        raw: p,
      },
    ];
  },

  async send({ credentials, channelExternalId, payload }): Promise<SendResult> {
    const baseUrl = credentials.base_url;
    const apiToken = credentials.api_token;
    const accountId = Number(credentials.account_id);
    const conversationId = Number(channelExternalId);
    if (!baseUrl || !apiToken || !accountId || !conversationId) {
      return { ok: false, error: "Missing chatwoot credentials or conversation id" };
    }

    const client = new ChatwootClient({ baseUrl, apiToken, accountId });
    const result = await client.sendTextMessage({
      accountId,
      conversationId,
      text: payload.kind === "text" ? payload.text : payload.caption ?? payload.url,
      messageType: "outgoing",
    });
    return result ? { ok: true } : { ok: false, error: "Chatwoot send failed" };
  },
};
