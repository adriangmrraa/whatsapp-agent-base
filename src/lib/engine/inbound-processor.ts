import { db } from "@/db";
import { conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveChannel, getDefaultTenantId, getAgentConfig } from "@/lib/tenants";
import {
  findOrCreateConversation,
  insertMessage,
  isMessageDuplicate,
  hasHumanOverride,
  setHumanOverride,
  checkRecentHumanActivity,
} from "@/lib/channels/router";
import { BufferManager, type BufferedMessage } from "@/lib/buffer/manager";
import { persistSessionTransition } from "@/lib/whatsapp/session-store";
import {
  toSessionContext,
  type RoutingDecision,
} from "@/lib/whatsapp/session-policy";
import {
  FIXED_ACK_REPLY,
  FIXED_CLARIFICATION_REPLY,
  HANDOFF_REPLY,
} from "@/lib/whatsapp/agent";
import { captureOrUpdateLead } from "@/lib/ycloud/lead";
import { normalizePhone } from "@/lib/ycloud/phone";
import { getProvider, loadProviderCredentials } from "@/lib/providers/registry";
import type { NormalizedInbound } from "@/lib/providers/types";
import logger from "@/lib/logger";

// ─── Inbound processor — the provider-agnostic engine core ───────────────────
//
// Every webhook route (ycloud, meta, chatwoot, telegram) reduces to:
//   verify signature → provider.parseInbound → processInbound(each)
//
// Pipeline: resolve tenant/channel → upsert lead → find/create conversation
// → dedup (platform id) → persist message → session policy (CAS) → route:
//   fixed replies   → send fixed text, no LLM
//   handoff         → claim effects, override, notify owner
//   allow_agent     → debounce buffer → run agent → provider.send
//   blocked/dup     → silence

export interface InboundOutcome {
  status:
    | "processed"
    | "agent_queued"
    | "fixed_reply"
    | "handoff"
    | "blocked"
    | "duplicate"
    | "suppressed"
    | "unresolved_tenant"
    | "error";
  conversationId?: number;
  tenantId?: number;
  routing?: RoutingDecision["kind"];
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  image: "[Image]",
  audio: "[Audio]",
  document: "[Document]",
  video: "[Video]",
  sticker: "[Sticker]",
  location: "[Location]",
};

export async function processInbound(
  inbound: NormalizedInbound,
): Promise<InboundOutcome> {
  // ── 1. Resolve tenant via channel identity ──────────────────────────────
  const channelRow = inbound.channelExternalId
    ? await resolveChannel(inbound.provider, inbound.channelExternalId)
    : null;
  const tenantId = channelRow?.tenantId ?? (await getDefaultTenantId());
  if (!tenantId) {
    logger.error({ provider: inbound.provider }, "[inbound] no tenant resolved");
    return { status: "unresolved_tenant" };
  }

  const phone = normalizePhone(inbound.externalUserId);
  const text = inbound.text ?? MEDIA_PLACEHOLDER[inbound.kind] ?? `[${inbound.kind}]`;

  // ── 2. Upsert lead (WhatsApp-family only — Telegram/Chatwoot carry their own ids)
  let leadId: number | undefined;
  try {
    leadId = await captureOrUpdateLead(phone, tenantId, {
      name: inbound.senderName,
      firstMessage: text,
    });
  } catch (error) {
    logger.error({ error, tenantId }, "[inbound] lead upsert failed");
  }

  // ── 3. Find or create conversation ──────────────────────────────────────
  // Meta serves WhatsApp, Messenger and Instagram behind one provider; the
  // concrete channel family lives in the channel row's config.
  const configuredChannel = (channelRow?.config as { channel?: string } | undefined)
    ?.channel;
  const channel =
    inbound.provider === "chatwoot"
      ? "chatwoot"
      : inbound.provider === "telegram"
        ? "telegram"
        : configuredChannel === "messenger"
          ? "messenger"
          : configuredChannel === "instagram"
            ? "instagram"
            : "whatsapp";

  const { id: conversationId } = await findOrCreateConversation({
    tenantId,
    channel,
    provider: inbound.provider,
    channelId: channelRow?.channelId,
    externalUserId: inbound.externalUserId,
    customerName: inbound.senderName,
    customerPhone: phone,
  });

  // ── 4. Dedup on platform message id (durable, unique index) ─────────────
  if (inbound.messageId) {
    if (await isMessageDuplicate(tenantId, inbound.messageId)) {
      return { status: "duplicate", conversationId, tenantId };
    }
  }

  // ── 5. Persist the inbound message ──────────────────────────────────────
  const mediaTypeMap = {
    image: "image",
    audio: "audio",
    document: "document",
    video: "video",
    sticker: "image",
    location: "location",
    text: "document",
  } as const;
  const attrs = inbound.media
    ? [
        {
          type: mediaTypeMap[inbound.media.kind] ?? "document",
          url: inbound.media.url,
          fileName: inbound.media.fileName,
          fileSize: inbound.media.fileSize,
          mimeType: inbound.media.mimeType,
          caption: inbound.media.caption,
          latitude: inbound.media.latitude,
          longitude: inbound.media.longitude,
        } as const,
      ]
    : undefined;

  const saved = await insertMessage({
    tenantId,
    conversationId,
    role: "user",
    content: text,
    contentAttributes: attrs,
    platformMessageId: inbound.messageId,
  });
  if (saved.wasDuplicate) return { status: "duplicate", conversationId, tenantId };
  void leadId;

  // ── 6. Session policy (CAS, fail-closed) ────────────────────────────────
  const cfg = await getAgentConfig(tenantId);
  const aiEnabled = cfg?.enabled ?? false;
  const override = await hasHumanOverride(conversationId);

  let decision: RoutingDecision;
  try {
    decision = await persistSessionTransition({
      conversationId,
      tenantId,
      messageId: inbound.messageId,
      text,
      messageType: inbound.kind,
      aiEnabled,
      hasHumanOverride: override,
    });
  } catch (error) {
    logger.error({ error, conversationId }, "[inbound] session persist failed — fail closed");
    return { status: "error", conversationId, tenantId };
  }

  switch (decision.kind) {
    case "duplicate":
      return { status: "duplicate", conversationId, tenantId, routing: "duplicate" };

    case "blocked":
      return { status: "blocked", conversationId, tenantId, routing: "blocked" };

    case "fixed_ack":
    case "fixed_clarification": {
      const reply = decision.kind === "fixed_ack" ? FIXED_ACK_REPLY : FIXED_CLARIFICATION_REPLY;
      if (decision.delivery === "allowed" && aiEnabled) {
        await deliverReply(tenantId, conversationId, reply);
      }
      return { status: "fixed_reply", conversationId, tenantId, routing: decision.kind };
    }

    case "handoff": {
      await setHumanOverride(conversationId, 24);
      if (decision.replyClaim && aiEnabled) {
        await deliverReply(tenantId, conversationId, HANDOFF_REPLY);
      }
      return { status: "handoff", conversationId, tenantId, routing: "handoff" };
    }

    case "allow_agent": {
      if (!aiEnabled) {
        return { status: "suppressed", conversationId, tenantId, routing: "allow_agent" };
      }
      const buffered: BufferedMessage = {
        content: text,
        messageId: inbound.messageId,
        timestamp: Date.now(),
        contentAttributes: attrs,
      };
      await BufferManager.enqueue("whatsapp", `${tenantId}:${conversationId}`, buffered, (messages) =>
        flushAgent(tenantId, conversationId, inbound.externalUserId, messages),
      );
      return { status: "agent_queued", conversationId, tenantId, routing: "allow_agent" };
    }
  }

  return { status: "suppressed", conversationId, tenantId };
}

// ─── Agent flush ─────────────────────────────────────────────────────────────

async function flushAgent(
  tenantId: number,
  conversationId: number,
  externalUserId: string,
  messages: BufferedMessage[],
): Promise<void> {
  // Re-check override: a human may have replied during the debounce window.
  if (await hasHumanOverride(conversationId)) return;
  if (await checkRecentHumanActivity(conversationId, 60)) return;

  const combined = messages.map((m) => m.content).join("\n");
  const { getConversationMessages } = await import("@/lib/channels/router");
  const history = await getConversationMessages(conversationId, 50);

  const agentMessages = history.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));
  if (agentMessages[agentMessages.length - 1]?.content !== combined) {
    agentMessages.push({ role: "user", content: combined });
  }

  const { runWhatsAppAgent } = await import("@/lib/whatsapp/agent");
  const { loadSessionState } = await import("@/lib/whatsapp/session-store");
  const session = await loadSessionState(conversationId);

  const result = await runWhatsAppAgent({
    tenantId,
    conversationId,
    customerPhone: externalUserId,
    messages: agentMessages,
    sessionContext: session ? toSessionContext(session) : undefined,
    routingKind: "allow_agent",
  });

  if (result.text) {
    await deliverReply(tenantId, conversationId, result.text);
  }
  for (const media of result.pendingMedia) {
    await deliverMedia(tenantId, conversationId, {
      url: media.url,
      kind: media.type === "sticker" ? "image" : media.type,
      caption: media.caption,
    });
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Outbound helpers ────────────────────────────────────────────────────────

async function getConversationProvider(conversationId: number) {
  const [conv] = await db
    .select({
      provider: conversations.provider,
      externalUserId: conversations.externalUserId,
      channelId: conversations.channelId,
      tenantId: conversations.tenantId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return conv;
}

async function channelContextFor(
  channelId: number | null,
): Promise<{ externalId: string; config: Record<string, unknown> }> {
  if (!channelId) return { externalId: "", config: {} };
  const { channels } = await import("@/db/schema");
  const [ch] = await db
    .select({ externalId: channels.externalId, config: channels.config })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return {
    externalId: ch?.externalId ?? "",
    config: (ch?.config as Record<string, unknown>) ?? {},
  };
}

export async function deliverReply(
  tenantId: number,
  conversationId: number,
  text: string,
): Promise<void> {
  const conv = await getConversationProvider(conversationId);
  if (!conv?.externalUserId) return;
  const provider = getProvider(conv.provider as never);
  if (!provider) return;
  const credentials = await loadProviderCredentials(tenantId, conv.provider as never);
  const { externalId: channelExternalId, config: channelConfig } =
    await channelContextFor(conv.channelId);

  const send = await provider.send({
    credentials,
    channelExternalId,
    to: conv.externalUserId,
    payload: { kind: "text", text },
    channelConfig,
  });
  if (!send.ok) {
    logger.error({ conversationId, error: send.error }, "[inbound] reply send failed");
  }

  await insertMessage({ tenantId, conversationId, role: "assistant", content: text });

  // Mirror into Chatwoot when the tenant has it enabled (non-blocking).
  mirrorToChatwoot(tenantId, conversationId, text).catch(() => {});
}

export async function deliverMedia(
  tenantId: number,
  conversationId: number,
  media: { url: string; kind: "image" | "document" | "video" | "audio"; caption?: string },
): Promise<void> {
  const conv = await getConversationProvider(conversationId);
  if (!conv?.externalUserId) return;
  const provider = getProvider(conv.provider as never);
  if (!provider) return;
  const credentials = await loadProviderCredentials(tenantId, conv.provider as never);
  const { externalId: channelExternalId, config: channelConfig } =
    await channelContextFor(conv.channelId);

  const send = await provider.send({
    credentials,
    channelExternalId,
    to: conv.externalUserId,
    payload: { kind: media.kind, url: media.url, caption: media.caption },
    channelConfig,
  });
  if (send.ok) {
    await insertMessage({
      tenantId,
      conversationId,
      role: "assistant",
      content: media.caption ?? `[${media.kind}]`,
      contentAttributes: [{ type: media.kind, url: media.url, caption: media.caption }],
    });
  }
  mirrorToChatwoot(tenantId, conversationId, media.caption ?? `[${media.kind}]`).catch(() => {});
}

// ─── Chatwoot mirroring ──────────────────────────────────────────────────────

export async function mirrorToChatwoot(
  tenantId: number,
  conversationId: number,
  content: string,
): Promise<void> {
  const cfg = await getAgentConfig(tenantId);
  if (!cfg?.chatwootEnabled || !cfg.chatwootBaseUrl || !cfg.chatwootAccountId) return;

  const [conv] = await db
    .select({ externalConversationId: conversations.externalConversationId, customerPhone: conversations.customerPhone, customerName: conversations.customerName })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return;

  const { ChatwootClient } = await import("@/lib/chatwoot/client");
  const { getCredential } = await import("@/lib/credentials");
  const apiToken = await getCredential({
    tenantId,
    provider: "chatwoot",
    key: "api_token",
    envFallback: process.env.CHATWOOT_API_TOKEN ?? "",
  });
  if (!apiToken) return;

  const client = new ChatwootClient({
    baseUrl: cfg.chatwootBaseUrl,
    apiToken,
    accountId: cfg.chatwootAccountId,
  });

  let cwConvId = conv.externalConversationId ? Number(conv.externalConversationId) : 0;
  if (!cwConvId && cfg.chatwootInboxId && conv.customerPhone) {
    const contact = await client.findOrCreateContact({
      accountId: cfg.chatwootAccountId,
      inboxId: cfg.chatwootInboxId,
      phone: conv.customerPhone,
      name: conv.customerName ?? conv.customerPhone,
    });
    if (contact) {
      const created = await client.createConversation({
        accountId: cfg.chatwootAccountId,
        inboxId: cfg.chatwootInboxId,
        contactId: contact.id,
        sourceId: `conv-${conversationId}`,
      });
      if (created) {
        cwConvId = created.id;
        await db
          .update(conversations)
          .set({ externalConversationId: String(cwConvId) })
          .where(eq(conversations.id, conversationId));
      }
    }
  }
  if (!cwConvId) return;

  await client.sendTextMessage({
    accountId: cfg.chatwootAccountId,
    conversationId: cwConvId,
    text: content,
    messageType: "outgoing",
  });
}
