import type { AgentSurface } from "@/lib/capabilities/types";

// ─── System One — deterministic decision layer (Jev / Laya) ──────────────────
//
// System One runs BEFORE (and beside) the LLM: it makes cheap, deterministic,
// auditable decisions — which intent this is, which capability groups to offer,
// whether to gate the turn — so the model only decides what genuinely needs
// language understanding. Default provider is Jev (rules); Laya is the
// swappable fallback/alternative. Neither the customer nor the internal agent
// talks to the LLM without consulting this layer.

export type SystemOneDecisionKind = "choice" | "score" | "gate" | "abstain";

export interface SystemOneDecision {
  kind: SystemOneDecisionKind;
  /** What was decided, e.g. "intent" or "capability-group". */
  label: string;
  /** Chosen option (choice decisions), e.g. "commercial" | "support". */
  choice?: string;
  /** Confidence in [0, 1] (score decisions). */
  score?: number;
  /** Whether the turn may proceed to the LLM / capabilities (gate decisions). */
  allow?: boolean;
  /** Deterministic, human-readable reason (never model-generated). */
  reason: string;
  /** Decision provider: "jev" | "laya" | "rules" | "hosted:{engine}". */
  provider: string;
  /** Provider-declared TTL (ms) for reusing this decision — informational. */
  ttl?: number;
}

export interface SystemOneInput {
  tenantId: number;
  surface: AgentSurface;
  text: string;
  /** Compact, surface-specific facts (session state, role, ...). */
  context?: Record<string, unknown>;
  /** Decision labels requested this turn, e.g. ["intent", "capability-group"]. */
  labels?: string[];
}

// ─── Label degradation registry ──────────────────────────────────────────────
//
// What an abstain means per label when the decision layer cannot answer:
// - fail-open ("open")   → abstain allows the turn (advisory labels only)
// - fail-closed ("closed") → abstain blocks the turn (protective labels)
// Unknown labels MUST default fail-closed — protective beats permissive.

export type LabelDegradation = "open" | "closed";

export const LABEL_DEGRADATION: Record<string, LabelDegradation> = {
  intent: "open",
  "capability-group": "open",
  risk: "closed",
  role: "closed",
  escalation: "closed",
};

/** Degradation posture for a label; unregistered labels fail closed. */
export function labelDegradation(label: string): LabelDegradation {
  return LABEL_DEGRADATION[label] ?? "closed";
}

/** A deterministic decision provider. Implementations must be side-effect free. */
export interface DecisionLayer {
  readonly name: string;
  /**
   * The full decision set for a turn (a hosted API can return intent +
   * capability groups + gates in one round-trip; rules return a single-item
   * set). `decide` delegates to the first element.
   */
  decideSet(input: SystemOneInput): Promise<SystemOneDecision[]>;
  decide(input: SystemOneInput): Promise<SystemOneDecision>;
}
