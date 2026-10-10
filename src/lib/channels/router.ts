import { db } from "@/db";
import { conversations, chatMessages, leads, attachments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { normalizePhone } from "@/lib/ycloud/phone";
import { getProvider, loadProviderCredentials } from "@/lib/providers/registry";
import type { ChannelProvider, OutboundPayload } from "@/lib/providers/types";
import logger from "@/lib/logger";

// ─── Channel router (multi-tenant) ───────────────────────────────────────────
//
// Single entry point for all conversation IO. Every query is tenant-scoped —
// this is the data-isolation barrier, same rule as clinicforge's tenant_id.

export type Channel = "whatsapp" | "telegram" | "instagram" | "messenger" | "chatwoot";

export interface MediaAttachment {
  type: "image" | "audio" | "document" | "video" | "location";
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  caption?: string;
  transcription?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}

export interface IncomingMessage {
  tenantId: number;
  channelId?: number;
  provider: ChannelProvider;
  channel: Channel;
  externalUserId: string;
  senderName?: string;
  content: string;
  platformMessageId: string;
  contentAttributes?: MediaAttachment[];
}

// ── Conversations ────────────────────────────────────────────────────────────

export async function findOrCreateConversation(input: {
  tenantId: number;
  channel: Channel;
  provider: ChannelProvider;
  channelId?: number;
  externalUserId: string;
  customerName?: string;
  customerPhone?: string;
}): Promise<{ id: number; isNew: boolean }> {
  const externalKey = `${input.provider}:${input.externalUserId}`;

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, input.tenantId),
        eq(conversations.whatsappId, externalKey),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };

  // Backward-compat: legacy rows stored the bare phone as whatsapp_id.
  const [legacy] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, input.tenantId),
        eq(conversations.whatsappId, input.externalUserId),
      ),
    )
    .limit(1);
  if (legacy) {
    await db
      .update(conversations)
      .set({ whatsappId: externalKey, provider: input.provider, channelId: input.channelId ?? null })
      .where(eq(conversations.id, legacy.id));
    return { id: legacy.id, isNew: false };
  }

  const finalPhone = normalizePhone(input.customerPhone || input.externalUserId);
  const [conv] = await db
    .insert(conversations)
    .values({
      tenantId: input.tenantId,
      whatsappId: externalKey,
      customerName: input.customerName || null,
      customerPhone: finalPhone,
      channel: input.channel,
      provider: input.provider,
      channelId: input.channelId ?? null,
      externalUserId: input.externalUserId,
      status: "active",
      lastMessageAt: new Date(),
      lastMessagePreview: null,
    })
    .returning({ id: conversations.id });

  if (finalPhone) await autoLinkLeadToConversation(input.tenantId, finalPhone, conv.id);
  return { id: conv.id, isNew: true };
}

async function autoLinkLeadToConversation(
  tenantId: number,
  phone: string,
  conversationId: number,
): Promise<void> {
  try {
    const [lead] = await db
      .select({ id: leads.id, conversationId: leads.conversationId })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.phone, phone)))
      .limit(1);
    if (lead && !lead.conversationId) {
      await db.update(leads).set({ conversationId }).where(eq(leads.id, lead.id));
    }
  } catch (err) {
    logger.warn({ err, tenantId, phone }, "[router] auto-link lead failed");
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface InsertMessageResult {
  id: number;
  wasDuplicate: boolean;
}

export async function insertMessage(input: {
  tenantId: number;
  conversationId: number;
  role: "user" | "assistant" | "system" | "human";
  content: string;
  contentAttributes?: MediaAttachment[];
  platformMessageId?: string;
}): Promise<InsertMessageResult> {
  const preview = input.content.slice(0, 250);

  let msg: { id: number };
  try {
    [msg] = await db
      .insert(chatMessages)
      .values({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        contentAttributes: input.contentAttributes ?? [],
        platformMessageId: input.platformMessageId || null,
      })
      .returning({ id: chatMessages.id });
  } catch (err) {
    // 23505 = unique_violation on (tenant_id, platform_message_id)
    const code = (err as { code?: string })?.code;
    const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (input.platformMessageId && (code === "23505" || causeCode === "23505")) {
      const [existing] = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.tenantId, input.tenantId),
            eq(chatMessages.platformMessageId, input.platformMessageId),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, wasDuplicate: true };
    }
    throw err;
  }

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: preview, updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));

  if (input.contentAttributes?.length && input.role === "user") {
    autoAttachToLead(input.tenantId, input.conversationId, msg.id, input.contentAttributes).catch(
      (err) => logger.error({ err }, "[router] autoAttach failed"),
    );
  }

  return { id: msg.id, wasDuplicate: false };
}

async function autoAttachToLead(
  tenantId: number,
  conversationId: number,
  messageId: number,
  attrs: MediaAttachment[],
): Promise<void> {
  try {
    const [conv] = await db
      .select({ customerPhone: conversations.customerPhone })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conv?.customerPhone) return;

    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.phone, conv.customerPhone)))
      .limit(1);

    for (const media of attrs) {
      if (!media.url) continue;
      await db.insert(attachments).values({
        tenantId,
        leadId: lead?.id ?? null,
        conversationId,
        messageId,
        type: media.type,
        url: media.url,
        fileName: media.fileName ?? null,
        mimeType: media.mimeType ?? null,
        fileSize: media.fileSize ?? null,
        caption: media.caption ?? null,
      });
    }
  } catch (error) {
    logger.error({ error }, "[router] autoAttachToLead error");
  }
}

export async function isMessageDuplicate(
  tenantId: number,
  platformMessageId: string,
): Promise<boolean> {
  if (!platformMessageId) return false;
  const existing = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.tenantId, tenantId),
        eq(chatMessages.platformMessageId, platformMessageId),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

export async function getConversationMessages(conversationId: number, limit = 50, offset = 0) {
  const recent = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit)
    .offset(offset);
  return recent.reverse();
}

/** True when a human agent messaged this conversation recently (default 60s). */
export async function checkRecentHumanActivity(
  conversationId: number,
  withinSeconds = 60,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinSeconds * 1000);
  const [recent] = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.role, "human")))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  if (!recent) return false;
  const t = recent.createdAt instanceof Date ? recent.createdAt.getTime() : new Date(recent.createdAt).getTime();
  return t > cutoff.getTime();
}

export async function hasHumanOverride(conversationId: number): Promise<boolean> {
  const [conv] = await db
    .select({ humanOverrideUntil: conversations.humanOverrideUntil })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return !!conv?.humanOverrideUntil && conv.humanOverrideUntil.getTime() > Date.now();
}

export async function setHumanOverride(conversationId: number, hours = 24): Promise<void> {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await db
    .update(conversations)
    .set({ humanOverrideUntil: until, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function clearHumanOverride(conversationId: number): Promise<void> {
  await db
    .update(conversations)
    .set({ humanOverrideUntil: null, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ── Outbound ─────────────────────────────────────────────────────────────────

/**
 * Sends a message through the conversation's owning provider. Persists the
 * message locally and (when enabled) mirrors it into Chatwoot.
 */
export async function sendOutboundMessage(input: {
  conversationId: number;
  content: string;
  role?: "assistant" | "human";
  media?: { url: string; kind: "image" | "document" | "video" | "audio"; caption?: string; fileName?: string };
}): Promise<{ ok: boolean; error?: string }> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conv) return { ok: false, error: `Conversation ${input.conversationId} not found` };

  const role = input.role ?? "human";
  const provider = getProvider(conv.provider as ChannelProvider);

  let result: { ok: boolean; error?: string } = { ok: true };
  if (provider && conv.externalUserId) {
    const credentials = await loadProviderCredentials(conv.tenantId, provider.provider);
    const payload: OutboundPayload = input.media
      ? { kind: input.media.kind, url: input.media.url, caption: input.content || undefined, fileName: input.media.fileName }
      : { kind: "text", text: input.content || " " };

    // The provider's "from"/target identity:
    //  - ycloud / meta → the channel's externalId (business phone / phone_number_id)
    //  - chatwoot      → the Chatwoot conversation id stored on the conversation
    const channelContext =
      provider.provider === "chatwoot"
        ? { externalId: conv.externalConversationId ?? "", config: {} as Record<string, unknown> }
        : await channelContextFromId(conv.channelId);

    result = await provider.send({
      credentials,
      channelExternalId: channelContext.externalId,
      to: conv.externalUserId,
      payload,
      channelConfig: channelContext.config,
    });

    if (!result.ok) {
      logger.error(
        { conversationId: input.conversationId, provider: provider.provider, error: result.error },
        "[router] outbound send failed",
      );
    }
  }

  await insertMessage({
    tenantId: conv.tenantId,
    conversationId: input.conversationId,
    role: role === "human" ? "assistant" : role,
    content: input.content || "[Media]",
    contentAttributes: input.media
      ? [{ type: input.media.kind, url: input.media.url, caption: input.content }]
      : undefined,
  });

  if (role === "human") {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .update(conversations)
      .set({ humanOverrideUntil: until, updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
  }

  return result;
}

async function channelContextFromId(
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
