// ─── JEV ledger (Phase 4 — measurement) ──────────────────────────────────────
//
// Shadow (observe only) + A/B (baseline vs +Jev) + stats (aggregate/report).
// Nothing here mutates a decision or a provider; it only measures. See the
// module headers for the invariants and the plan (§7 adoption methodology).

export {
  COST_MODELS,
  costModelFor,
  estimateCostUsd,
  estimateInputTokens,
  estimateOutputTokens,
  measureDecide,
  percentile,
  sum,
} from "./types";
export type {
  CostModel,
  DecideOutcome,
  DecisionSample,
  LedgerMode,
  LedgerSink,
  MeasureMeta,
} from "./types";

export { runShadow, ShadowLedger } from "./shadow";
export type { RunShadowOptions, ShadowResult } from "./shadow";

export {
  answerMapMatches,
  DEFAULT_GATE,
  evaluateGate,
  runAb,
} from "./ab";
export type {
  AbDelta,
  AbOptions,
  AbResult,
  AbTask,
  AbTaskResult,
  GateResult,
  GateThresholds,
  ProviderRunMetrics,
} from "./ab";

export { aggregate, formatAbReport, formatStatsReport } from "./stats";
export type { AggregateStats, ProviderStats } from "./stats";
