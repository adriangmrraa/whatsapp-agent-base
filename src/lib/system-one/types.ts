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
  /** Decision provider: "jev" | "laya" | "rules". */
  provider: string;
}

export interface SystemOneInput {
  tenantId: number;
  surface: AgentSurface;
  text: string;
  /** Compact, surface-specific facts (session state, role, ...). */
  context?: Record<string, unknown>;
}

/** A deterministic decision provider. Implementations must be side-effect free. */
export interface DecisionLayer {
  readonly name: string;
  decide(input: SystemOneInput): Promise<SystemOneDecision>;
}
