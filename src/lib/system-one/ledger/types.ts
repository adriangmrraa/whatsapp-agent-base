import { estimateTokens } from "../context/primer";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";

// ─── Ledger measurement primitives ───────────────────────────────────────────
//
// Phase 4 is MEASUREMENT ONLY. The ledger observes what a decision cost and how
// it compares to a baseline; it NEVER changes a pack's behavior (plan §7 —
// "shadow-first, evidence-gated"). Nothing in this module mutates state, calls
// a network, or branches on a decision.
//
// Token counts are ESTIMATES (~4 chars/token, via the primer's estimator). The
// provider-neutral `decide` contract deliberately does not surface the hosted
// APIs' `usage` blocks, so the ledger derives tokens from the exact `state` and
// `questions` a provider was handed. That makes the numbers comparable across
// providers in an A/B, which is what the gate needs — not billing-exact.
//
// Prices are USD per 1M tokens from the plan (§1.1/§1.2); output is free on
// both hosted providers. Override per provider through `AbOptions.costModels`.

export type LedgerMode = "shadow" | "ab";

export interface CostModel {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const COST_MODELS: Readonly<Record<string, CostModel>> = {
  jev: { inputPerMillion: 0.042, outputPerMillion: 0 },
  "openai-decisions": { inputPerMillion: 0.1, outputPerMillion: 0 },
  rules: { inputPerMillion: 0, outputPerMillion: 0 },
};

const FREE_COST_MODEL: CostModel = { inputPerMillion: 0, outputPerMillion: 0 };

/** Cost model for a provider name; unknown providers are treated as free. */
export function costModelFor(provider: string): CostModel {
  return COST_MODELS[provider] ?? FREE_COST_MODEL;
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  model: CostModel,
): number {
  return (
    (inputTokens * model.inputPerMillion +
      outputTokens * model.outputPerMillion) /
    1_000_000
  );
}

/**
 * One recorded decision: the unit the ledger aggregates. `error` is set (and
 * the token/output fields reflect "no answer") when the provider failed; the
 * caller decides how a failure maps to a pack's fail posture, not the ledger.
 */
export interface DecisionSample {
  provider: string;
  mode: LedgerMode;
  packId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
  timestamp: number;
}

/** Anything that collects samples (the shadow ledger, a test spy, ...). */
export interface LedgerSink {
  record(sample: DecisionSample): void;
}

export interface MeasureMeta {
  mode: LedgerMode;
  packId?: string;
  costModel?: CostModel;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
}

export interface DecideOutcome<T extends QuestionPack> {
  /** `null` when the provider threw — never a thrown exception from here. */
  answers: AnswerMap<T> | null;
  sample: DecisionSample;
}

export function estimateInputTokens(
  state: State,
  questions: QuestionPack,
): number {
  return estimateTokens(state) + estimateTokens(questions);
}

export function estimateOutputTokens(answers: unknown): number {
  return estimateTokens(answers ?? {});
}

/**
 * Run one provider decision and time/measure it. This is the single primitive
 * shared by shadow and A/B; it NEVER throws — a provider failure becomes a
 * sample with `error` set and `answers: null`, so a measurement can never
 * redirect or block the caller's real path.
 */
export async function measureDecide<T extends QuestionPack>(
  provider: DecisionProvider,
  state: State,
  questions: T,
  meta: MeasureMeta,
): Promise<DecideOutcome<T>> {
  const now = meta.now ?? Date.now;
  const model = meta.costModel ?? costModelFor(provider.name);
  const inputTokens = estimateInputTokens(state, questions);
  const timestamp = now();

  try {
    const answers = await provider.decide(state, questions);
    const latencyMs = now() - timestamp;
    const outputTokens = estimateOutputTokens(answers);
    return {
      answers,
      sample: {
        provider: provider.name,
        mode: meta.mode,
        packId: meta.packId,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(inputTokens, outputTokens, model),
        latencyMs,
        timestamp,
      },
    };
  } catch (error) {
    const latencyMs = now() - timestamp;
    return {
      answers: null,
      sample: {
        provider: provider.name,
        mode: meta.mode,
        packId: meta.packId,
        inputTokens,
        outputTokens: 0,
        costUsd: estimateCostUsd(inputTokens, 0, model),
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
        timestamp,
      },
    };
  }
}

/** Nearest-rank percentile on a copy; empty input returns 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index];
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
