// ─── Idempotent handoff effect claims ────────────────────────────────────────
//
// One transaction coordinates handoff side effects: human override, owner
// notification, customer reply. Every effect is claimed through
// `conversation_session_effect_claims` (unique per conversation+episode+
// effect), so retries and concurrent deliveries are harmless.

import { db } from "@/db";
import { conversationSessionEffectClaims } from "@/db/schema";

export type HandoffEffectKind = "human_override" | "owner_notification" | "customer_reply";

export type HandoffClaimInput = {
  conversationId: number;
  tenantId: number;
  episode: number;
  inboundMessageId: string;
  aiEnabled: boolean;
};

export type HandoffClaimResult = {
  overrideClaimed: boolean;
  ownerNotificationClaimed: boolean;
  customerReplyClaimed: boolean;
  ownerNotificationDeliverable: boolean;
  customerReplyDeliverable: boolean;
};

export type ClaimOutcome = "claimed" | "duplicate";

export interface HandoffEffectRepository {
  claimEffect(input: {
    conversationId: number;
    tenantId: number;
    episode: number;
    effectKind: HandoffEffectKind;
    inboundMessageId: string;
  }): Promise<ClaimOutcome>;
}

export interface HandoffEffectClaimant {
  claimHandoffEffects(input: HandoffClaimInput): Promise<HandoffClaimResult>;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === "23505") return true;
  const message = record.message;
  if (typeof message === "string" && /duplicate key|unique constraint|already exists/i.test(message))
    return true;
  const cause = (record.cause ?? record.error) as unknown;
  if (cause && typeof cause === "object") {
    const nested = cause as Record<string, unknown>;
    if (nested.code === "23505") return true;
    if (typeof nested.message === "string" && /duplicate key|unique constraint/i.test(nested.message))
      return true;
  }
  return false;
}

const HANDOFF_EFFECTS: readonly HandoffEffectKind[] = [
  "human_override",
  "owner_notification",
  "customer_reply",
];

export function resolveHandoffDelivery(input: {
  aiEnabled: boolean;
  replyClaimed: boolean;
}): boolean {
  return input.aiEnabled && input.replyClaimed;
}

export type HandoffTransportInput = {
  notifyClaim: boolean;
  replyClaim: boolean;
  delivery: "allowed" | "suppressed";
};

export type HandoffTransportDecision = {
  writeOverride: boolean;
  sendOwnerNotification: boolean;
  sendCustomerReply: boolean;
};

export function resolveHandoffTransport(input: HandoffTransportInput): HandoffTransportDecision {
  return {
    writeOverride: input.notifyClaim,
    sendOwnerNotification: input.notifyClaim,
    sendCustomerReply: input.replyClaim && input.delivery === "allowed",
  };
}

export class HandoffEffectService implements HandoffEffectClaimant {
  constructor(private readonly repository: HandoffEffectRepository) {}

  async claimHandoffEffects(input: HandoffClaimInput): Promise<HandoffClaimResult> {
    const claimed = new Map<HandoffEffectKind, boolean>();
    for (const effectKind of HANDOFF_EFFECTS) {
      claimed.set(
        effectKind,
        (await this.repository.claimEffect({
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          episode: input.episode,
          effectKind,
          inboundMessageId: input.inboundMessageId,
        })) === "claimed",
      );
    }
    const customerReplyClaimed = claimed.get("customer_reply") ?? false;
    const ownerNotificationClaimed = claimed.get("owner_notification") ?? false;
    return {
      overrideClaimed: claimed.get("human_override") ?? false,
      ownerNotificationClaimed,
      customerReplyClaimed,
      ownerNotificationDeliverable: ownerNotificationClaimed,
      customerReplyDeliverable: resolveHandoffDelivery({
        aiEnabled: input.aiEnabled,
        replyClaimed: customerReplyClaimed,
      }),
    };
  }
}

export class DrizzleHandoffEffectRepository implements HandoffEffectRepository {
  async claimEffect(input: {
    conversationId: number;
    tenantId: number;
    episode: number;
    effectKind: HandoffEffectKind;
    inboundMessageId: string;
  }): Promise<ClaimOutcome> {
    try {
      await db.insert(conversationSessionEffectClaims).values({
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        episode: input.episode,
        effectKind: input.effectKind,
        claimant: "agent",
        inboundMessageId: input.inboundMessageId,
      });
      return "claimed";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }
}
