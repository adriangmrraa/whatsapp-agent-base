"use server";

import { db } from "@/db";
import { conversations, chatMessages, leads, orders } from "@/db/schema";
import { eq, desc, asc, and, sql, count } from "drizzle-orm";
import { sendText } from "@/lib/ycloud";
import { saveMessage } from "@/lib/ycloud/conversation";
import type { ConversationSummary, Message } from "@/types/chat";

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Retrieve all active conversations with lead info and message counts.
 */
export async function getConversationsAction(): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      whatsappId: conversations.whatsappId,
      customerName: conversations.customerName,
      customerPhone: conversations.customerPhone,
      status: conversations.status,
      channel: conversations.channel,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      humanOverrideUntil: conversations.humanOverrideUntil,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`(
        SELECT ${count()} FROM ${chatMessages}
        WHERE ${chatMessages.conversationId} = ${conversations.id}
      )`,
    })
    .from(conversations)
    .orderBy(
      sql`COALESCE(${conversations.lastMessageAt}, ${conversations.updatedAt}) DESC`,
    )
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    whatsappId: row.whatsappId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    status: row.status as ConversationSummary["status"],
    channel: row.channel as ConversationSummary["channel"],
    lastMessageAt: row.lastMessageAt
      ? row.lastMessageAt.toISOString()
      : null,
    lastMessagePreview: row.lastMessagePreview,
    humanOverrideUntil: row.humanOverrideUntil
      ? row.humanOverrideUntil.toISOString()
      : null,
    messageCount: Number(row.messageCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Retrieve messages for a given conversation, ordered chronologically.
 */
export async function getConversationMessagesAction(
  conversationId: number,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as Message["role"],
    content: row.content,
    contentAttributes: (row.contentAttributes ?? undefined) as
      | Message["contentAttributes"]
      | undefined,
    platformMessageId: row.platformMessageId ?? undefined,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  }));
}

/**
 * Send a reply from the admin to the customer.
 * Saves the message as "human" role and sends via YCloud WhatsApp API.
 */
export async function sendReplyAction(
  conversationId: number,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const [conv] = await db
      .select({
        id: conversations.id,
        customerPhone: conversations.customerPhone,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv) {
      return { success: false, error: "Conversación no encontrada" };
    }

    // Save message in DB
    await saveMessage(conversationId, "human", content);

    // Send via WhatsApp if we have a phone number
    if (conv.customerPhone) {
      const result = await sendText(conv.customerPhone, content);
      if (!result.ok) {
        return { success: false, error: result.error };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[sendReplyAction] Error:", error);
    return {
      success: false,
      error: "Error al enviar mensaje",
    };
  }
}

/**
 * Toggle human override mode for a conversation.
 * Active = set humanOverrideUntil to now + 30 min.
 * Inactive = clear humanOverrideUntil.
 */
export async function toggleHumanOverrideAction(
  conversationId: number,
): Promise<{ success: boolean; active: boolean; error?: string }> {
  try {
    const [conv] = await db
      .select({ humanOverrideUntil: conversations.humanOverrideUntil })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conv) {
      return { success: false, active: false, error: "Conversación no encontrada" };
    }

    const isCurrentlyActive = conv.humanOverrideUntil
      ? new Date(conv.humanOverrideUntil) > new Date()
      : false;

    const until = isCurrentlyActive
      ? null
      : new Date(Date.now() + 30 * 60 * 1000); // +30 min

    await db
      .update(conversations)
      .set({
        humanOverrideUntil: until,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    return { success: true, active: !isCurrentlyActive };
  } catch (error) {
    console.error("[toggleHumanOverrideAction] Error:", error);
    return { success: false, active: false, error: "Error al actualizar" };
  }
}

/**
 * Update lead information (name, phone, notes).
 */
export async function updateLeadAction(
  leadId: number,
  data: { name?: string; phone?: string; notes?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (Object.keys(updateData).length === 0) {
      return { success: true };
    }

    await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, leadId));

    return { success: true };
  } catch (error) {
    console.error("[updateLeadAction] Error:", error);
    return { success: false, error: "Error al actualizar lead" };
  }
}

/**
 * Get lead associated with a conversation (by conversationId or phone).
 */
export async function getLeadByConversationAction(conversationId: number) {
  // First try: direct link via conversationId
  let [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.conversationId, conversationId))
    .limit(1);

  // Second try: by phone number
  if (!lead) {
    const [conv] = await db
      .select({ customerPhone: conversations.customerPhone })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv?.customerPhone) {
      [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.phone, conv.customerPhone))
        .limit(1);
    }
  }

  return lead ?? null;
}

/**
 * Get orders for a given lead.
 */
export async function getOrdersByLeadAction(leadId: number) {
  return db
    .select()
    .from(orders)
    .where(eq(orders.leadId, leadId))
    .orderBy(desc(orders.createdAt))
    .limit(20);
}
