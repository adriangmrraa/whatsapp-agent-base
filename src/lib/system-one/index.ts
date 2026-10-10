import { getDecisionLayer } from "./registry";
import { labelDegradation } from "./types";
import type { SystemOneDecision, SystemOneInput } from "./types";

export type {
  DecisionLayer,
  LabelDegradation,
  SystemOneDecision,
  SystemOneDecisionKind,
  SystemOneInput,
} from "./types";
export { LABEL_DEGRADATION, labelDegradation } from "./types";
export { ruleBasedDecisionLayer } from "./rules";
export {
  getDecisionConfig,
  isDecisionConfigured,
  invalidateDecisionConfigCache,
} from "./config";
export type { DecisionConfig, DecisionEngine } from "./config";
export { createHostedDecisionLayer } from "./hosted";
export type { HostedDecisionLayerOptions } from "./hosted";
export { getDecisionLayer } from "./registry";

// ─── System One entry point ──────────────────────────────────────────────────
//
// `getDecisionLayer(tenantId)` resolves the per-tenant layer: the local rules
// when no hosted API is configured, or the hosted Jev/Laya chain (breaker →
// rules fallback) when it is. Both engines (customer WhatsApp + internal
// voice) call `decideForTurn` through this single entry point.

function abstain(
  label: string,
  reason: string,
  provider: string,
): SystemOneDecision {
  return {
    kind: "abstain",
    label,
    allow: labelDegradation(label) === "open",
    reason,
    provider,
  };
}

/**
 * Consult the deterministic layer for a turn. Never throws — a decision-layer
 * failure degrades to an abstain whose `allow` follows the label's
 * degradation posture (intent fails open, protective labels fail closed).
 *
 * The effective decision is the first `allow === false` in the set (a gate
 * anywhere wins), else the first element; an empty set abstains.
 */
export async function decideForTurn(
  input: SystemOneInput,
): Promise<SystemOneDecision> {
  const label = input.labels?.[0] ?? "intent";
  try {
    const layer = await getDecisionLayer(input.tenantId);
    const decisions = await layer.decideSet(input);
    const effective =
      decisions.find((d) => d.allow === false) ?? decisions[0];
    if (effective) return effective;
    return abstain(label, "empty_decision_set", layer.name);
  } catch {
    return abstain(label, "decision_layer_unavailable", "rules");
  }
}
