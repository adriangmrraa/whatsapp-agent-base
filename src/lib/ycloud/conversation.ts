import { db } from "@/db";
import { conversations, chatMessages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { normalizePhone } from "./phone";
import { truncatePreview } from "./urls";

export interface ConversationOptions {
  customerName?: string;
}

export interface Message {
  role: string;
  content: string;
}

export interface SaveMessageOptions {
  /** YCloud platform message id for dedup. */
  platformMessageId?: string;
  /** Structured metadata attached to the message (e.g. media attributes). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentAttributes?: any[];
}

/**
 * Retrieve an existing conversation by phone or create a new one.
 *
 * The lookup uses `whatsapp_id` (unique constraint). On creation both
 * `whatsapp_id` and `customer_phone` are set to the normalized phone.
 *
 * @returns The conversation id.
 */
export async function getOrCreateConversation(
  phone: string,
  options?: ConversationOptions,
): Promise<number> {
  const normalizedPhone = normalizePhone(phone);

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.whatsappId, normalizedPhone))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [created] = await db
    .insert(conversations)
    .values({
      whatsappId: normalizedPhone,
      customerPhone: normalizedPhone,
      customerName: options?.customerName ?? null,
      status: "active",
      channel: "whatsapp",
    })
    .returning({ id: conversations.id });

  return created.id;
}

/**
 * Load all chat messages for a conversation, ordered by creation time ASC.
 *
 * DB roles are mapped for display: `"human"` → `"user"`; other roles
 * (`"user"`, `"assistant"`, `"system"`) are returned as-is.
 *
 * @returns An array of `{ role, content }` objects. Empty array if no messages.
 */
export async function loadConversation(
  conversationId: number,
): Promise<Message[]> {
  const rows = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((row) => ({
    role: row.role === "human" ? "user" : row.role,
    content: row.content,
  }));
}

/**
 * Persist a new message and update the parent conversation's metadata.
 *
 * Display roles (`"user"`) are mapped back to DB roles (`"human"` → `"human"`;
 * `"user"` stays `"user"`; `"assistant"` → `"assistant"`; `"system"` →
 * `"system"`). Falls back to `"human"` for any unhandled role.
 *
 * @returns The newly created chat message id.
 */
export async function saveMessage(
  conversationId: number,
  role: string,
  content: string,
  options?: SaveMessageOptions,
): Promise<number> {
  // Map display roles to DB-compatible roles
  const dbRole = ["user", "assistant", "system", "human"].includes(role)
    ? (role as "user" | "assistant" | "system" | "human")
    : "human";

  const [saved] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      role: dbRole,
      content,
      contentAttributes: (options?.contentAttributes ?? []) as any,
      platformMessageId: options?.platformMessageId ?? null,
    })
    .returning({ id: chatMessages.id });

  // Touch the parent conversation with the latest preview
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: truncatePreview(content, 100),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  return saved.id;
}
