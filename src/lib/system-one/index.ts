import type { DecisionLayer, SystemOneDecision, SystemOneInput } from "./types";
import { ruleBasedDecisionLayer } from "./rules";

export type {
  DecisionLayer,
  SystemOneDecision,
  SystemOneDecisionKind,
  SystemOneInput,
} from "./types";
export { ruleBasedDecisionLayer } from "./rules";

// ─── System One registry ─────────────────────────────────────────────────────
//
// Jev is the default deterministic layer (local rules today; a hosted Jev API
// tomorrow). Laya remains available as a swappable alternative behind the same
// DecisionLayer contract. Both engines (customer WhatsApp + internal voice)
// call `decide` through this single entry point.

export function getDecisionLayer(): DecisionLayer {
  return ruleBasedDecisionLayer;
}

/**
 * Consult the deterministic layer for a turn. Never throws — a decision-layer
 * failure degrades to "allow, no opinion" so the agent flow is never blocked.
 */
export async function decideForTurn(
  input: SystemOneInput,
): Promise<SystemOneDecision> {
  try {
    return await getDecisionLayer().decide(input);
  } catch {
    return {
      kind: "abstain",
      label: "intent",
      allow: true,
      reason: "decision_layer_unavailable",
      provider: "rules",
    };
  }
}
