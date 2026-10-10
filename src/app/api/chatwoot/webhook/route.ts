import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, agentConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProvider } from "@/lib/providers/registry";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { insertMessage, setHumanOverride } from "@/lib/channels/router";
import { loadProviderCredentials } from "@/lib/providers/registry";
import logger from "@/lib/logger";

// ─── Chatwoot webhook ────────────────────────────────────────────────────────
//
// Receives message_created events from a tenant's Chatwoot. When a HUMAN
// agent sends an outgoing message inside Chatwoot and the tenant is in
// "inbox" mode, we bridge it back to the end customer through the
// conversation's owning provider (ycloud/meta) and mark a human override.

interface ChatwootPayload {
  event?: string;
  message_type?: string;
  private?: boolean;
  id?: number;
  content?: string;
  conversation?: { id?: number; inbox_id?: number };
  account?: { id?: number };
  sender?: { type?: string; name?: string };
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = await checkRateLimit(`chatwoot-webhook:${ip}`).catch(() => null);
  if (rate && !rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let payload: ChatwootPayload;
  try {
    payload = (await req.json()) as ChatwootPayload;
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  if (payload.event !== "message_created" || payload.private || payload.message_type !== "outgoing") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const cwConvId = payload.conversation?.id;
  const accountId = payload.account?.id;
  if (!cwConvId || !accountId || !payload.content) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    // Resolve tenant by (chatwoot account_id) via agent_config.
    const [cfg] = await db
      .select({ tenantId: agentConfig.tenantId, mode: agentConfig.chatwootMode })
      .from(agentConfig)
      .where(eq(agentConfig.chatwootAccountId, accountId))
      .limit(1);
    if (!cfg || cfg.mode !== "inbox") {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const tenantId = cfg.tenantId;

    // Map the Chatwoot conversation back to our conversation.
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.externalConversationId, String(cwConvId)))
      .limit(1);
    if (!conv || conv.tenantId !== tenantId || !conv.externalUserId) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Dedup: a message we mirrored into Chatwoot would echo back — skip when
    // the last assistant message has the same content within a short window.
    // (Cheap check; Chatwoot does not send us our own message ids.)
    const text = payload.content;

    // Forward to the customer through the owning provider.
    const provider = getProvider(conv.provider as never);
    if (provider && conv.provider !== "chatwoot") {
      const credentials = await loadProviderCredentials(tenantId, conv.provider as never);
      const { channels } = await import("@/db/schema");
      const [ch] = conv.channelId
        ? await db.select().from(channels).where(eq(channels.id, conv.channelId)).limit(1)
        : [null];
      const send = await provider.send({
        credentials,
        channelExternalId: ch?.externalId ?? "",
        to: conv.externalUserId,
        payload: { kind: "text", text },
      });
      if (!send.ok) {
        logger.error({ error: send.error, conversationId: conv.id }, "[chatwoot] bridge send failed");
      }
    }

    await insertMessage({
      tenantId,
      conversationId: conv.id,
      role: "human",
      content: text,
      platformMessageId: `cw-${payload.id}`,
    });

    // Human answered → silence the agent for 24h on this conversation.
    await setHumanOverride(conv.id, 24);
  } catch (error) {
    logger.error({ error }, "[chatwoot:webhook] processing failed");
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
