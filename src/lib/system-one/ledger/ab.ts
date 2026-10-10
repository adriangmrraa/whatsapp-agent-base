import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import {
  costModelFor,
  measureDecide,
  percentile,
  sum,
  type CostModel,
  type DecisionSample,
} from "./types";

// ─── A/B ledger — baseline vs +Jev ───────────────────────────────────────────
//
// The evidence gate (plan §7): run the SAME labeled task set through a baseline
// (rules-only or LLM-only) and through the +Jev candidate, then compare. The
// metric that decides adoption is `costPerVerifiedTask`; `turns`, tokens,
// wall-clock, and `wasted` explain WHY it moved, and the gate needs all of them.
//
// "wasted" is the honesty check the plan insists on (§7/§10): a decision that
// was SUPPOSED to save work but did not — either it cost at least as much as
// the baseline, or it regressed verification. A pack that never saves is a
// negative result the ledger must surface, not hide.
//
// The candidate may run on a smaller `candidateState` (exactly how context
// priming saves tokens): baseline sees the full context, the +Jev pack sees the
// trimmed one. Everything else is measured identically for both sides.

export interface AbTask {
  id: string;
  /** State for the baseline provider. */
  state: State;
  /** Optional trimmed state for the candidate (e.g. after context priming). */
  candidateState?: State;
  questions: QuestionPack;
  /** Ground-truth answers; used to mark a task verified. */
  expected?: AnswerMap<QuestionPack>;
  /** Custom verifier; overrides `expected`. Receives non-null answers. */
  verify?: (answers: AnswerMap<QuestionPack>) => boolean;
  /** Whether the candidate decision is meant to save work (default true). */
  expectsSaving?: boolean;
}

export interface ProviderRunMetrics {
  provider: string;
  /** Provider invocations == LLM turns for this run. */
  turns: number;
  failedTurns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  wallClockMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  verifiedTasks: number;
  /** `null` when nothing verified (undefined ratio, not zero-cost). */
  costPerVerifiedTask: number | null;
  wastedTasks: number;
}

export interface AbTaskResult {
  id: string;
  baseline: DecisionSample;
  candidate: DecisionSample;
  baselineVerified: boolean;
  candidateVerified: boolean;
  wasted: boolean;
}

export interface AbDelta {
  costSavedUsd: number;
  costSavedPct: number;
  turnsSaved: number;
  inputTokensSaved: number;
  wallClockSavedMs: number;
  /** candidate verified / baseline verified (1 when baseline verified none). */
  verifiedRatio: number;
}

export interface AbResult {
  packId?: string;
  tasks: AbTaskResult[];
  baseline: ProviderRunMetrics;
  candidate: ProviderRunMetrics;
  delta: AbDelta;
}

export interface AbOptions {
  packId?: string;
  baseline: DecisionProvider;
  candidate: DecisionProvider;
  tasks: readonly AbTask[];
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
  /** Absolute tolerance for `noul`/`score` ground-truth matching. */
  tolerance?: number;
  /** Per-provider price overrides. */
  costModels?: Record<string, CostModel>;
}

const DEFAULT_TOLERANCE = 0.1;

function answerMatches(
  actual: Answer | undefined,
  expected: Answer,
  tolerance: number,
): boolean {
  if (!actual) return false;
  if (actual.type === "no-answer" || expected.type === "no-answer") {
    return actual.type === expected.type;
  }
  if (actual.type !== expected.type) return false;
  if (actual.type === "noul" && expected.type === "noul") {
    return Math.abs(actual.noul - expected.noul) <= tolerance;
  }
  if (actual.type === "choice" && expected.type === "choice") {
    return actual.choice === expected.choice;
  }
  if (actual.type === "score" && expected.type === "score") {
    return Math.abs(actual.score - expected.score) <= tolerance;
  }
  return false;
}

/** True when every expected answer is matched within `tolerance`. */
export function answerMapMatches(
  actual: AnswerMap<QuestionPack> | null,
  expected: AnswerMap<QuestionPack>,
  tolerance: number = DEFAULT_TOLERANCE,
): boolean {
  if (!actual) return false;
  for (const id of Object.keys(expected)) {
    if (!answerMatches(actual[id], expected[id], tolerance)) return false;
  }
  return true;
}

function verified(
  task: AbTask,
  answers: AnswerMap<QuestionPack> | null,
  tolerance: number,
): boolean {
  if (!answers) return false;
  if (task.verify) return task.verify(answers);
  if (task.expected) return answerMapMatches(answers, task.expected, tolerance);
  return true;
}

function summarize(
  provider: string,
  samples: readonly DecisionSample[],
  verifiedFlags: readonly boolean[],
  wastedFlags: readonly boolean[],
): ProviderRunMetrics {
  const wallClockMs = sum(samples.map((s) => s.latencyMs));
  const verifiedTasks = verifiedFlags.filter(Boolean).length;
  const costUsd = sum(samples.map((s) => s.costUsd));
  return {
    provider,
    turns: samples.length,
    failedTurns: samples.filter((s) => s.error).length,
    inputTokens: sum(samples.map((s) => s.inputTokens)),
    outputTokens: sum(samples.map((s) => s.outputTokens)),
    costUsd,
    wallClockMs,
    avgLatencyMs: samples.length > 0 ? wallClockMs / samples.length : 0,
    p95LatencyMs: percentile(
      samples.map((s) => s.latencyMs),
      0.95,
    ),
    verifiedTasks,
    costPerVerifiedTask: verifiedTasks > 0 ? costUsd / verifiedTasks : null,
    wastedTasks: wastedFlags.filter(Boolean).length,
  };
}

function savedPct(baseline: number, candidate: number): number {
  if (baseline === 0) return 0;
  return ((baseline - candidate) / baseline) * 100;
}

/**
 * Run a labeled task set through baseline and candidate and compare them.
 * Never throws on a provider failure — a failed turn becomes `answers: null`,
 * which simply fails verification for that task.
 */
export async function runAb(options: AbOptions): Promise<AbResult> {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const baselineModel =
    options.costModels?.[options.baseline.name] ??
    costModelFor(options.baseline.name);
  const candidateModel =
    options.costModels?.[options.candidate.name] ??
    costModelFor(options.candidate.name);

  const taskResults: AbTaskResult[] = [];
  const baselineSamples: DecisionSample[] = [];
  const candidateSamples: DecisionSample[] = [];

  for (const task of options.tasks) {
    const baselineOut = await measureDecide(
      options.baseline,
      task.state,
      task.questions,
      {
        mode: "ab",
        packId: options.packId,
        now: options.now,
        costModel: baselineModel,
      },
    );
    const candidateOut = await measureDecide(
      options.candidate,
      task.candidateState ?? task.state,
      task.questions,
      {
        mode: "ab",
        packId: options.packId,
        now: options.now,
        costModel: candidateModel,
      },
    );
    baselineSamples.push(baselineOut.sample);
    candidateSamples.push(candidateOut.sample);

    const baselineVerified = verified(task, baselineOut.answers, tolerance);
    const candidateVerified = verified(task, candidateOut.answers, tolerance);
    const expectsSaving = task.expectsSaving !== false;
    const wasted =
      expectsSaving &&
      (candidateOut.sample.costUsd >= baselineOut.sample.costUsd ||
        (baselineVerified && !candidateVerified));

    taskResults.push({
      id: task.id,
      baseline: baselineOut.sample,
      candidate: candidateOut.sample,
      baselineVerified,
      candidateVerified,
      wasted,
    });
  }

  const baseline = summarize(
    options.baseline.name,
    baselineSamples,
    taskResults.map((t) => t.baselineVerified),
    [],
  );
  const candidate = summarize(
    options.candidate.name,
    candidateSamples,
    taskResults.map((t) => t.candidateVerified),
    taskResults.map((t) => t.wasted),
  );

  const delta: AbDelta = {
    costSavedUsd: baseline.costUsd - candidate.costUsd,
    costSavedPct: savedPct(baseline.costUsd, candidate.costUsd),
    turnsSaved: baseline.turns - candidate.turns,
    inputTokensSaved: baseline.inputTokens - candidate.inputTokens,
    wallClockSavedMs: baseline.wallClockMs - candidate.wallClockMs,
    verifiedRatio:
      baseline.verifiedTasks === 0
        ? 1
        : candidate.verifiedTasks / baseline.verifiedTasks,
  };

  return { packId: options.packId, tasks: taskResults, baseline, candidate, delta };
}

// ─── Activation gate (plan §7 step 4) ────────────────────────────────────────
//
// Activate a pack ONLY if: cost ↓ ≥30%, quality ≥0.95× baseline, and p95
// latency ≤1.2× baseline. Otherwise keep it in shadow or drop it. These are the
// plan's defaults; thresholds are per-pack tunables, not hardcoded truth.

export interface GateThresholds {
  minCostReductionPct: number;
  minQualityRatio: number;
  maxP95LatencyRatio: number;
}

export const DEFAULT_GATE: GateThresholds = {
  minCostReductionPct: 30,
  minQualityRatio: 0.95,
  maxP95LatencyRatio: 1.2,
};

export interface GateResult {
  pass: boolean;
  reasons: string[];
}

export function evaluateGate(
  result: AbResult,
  thresholds: GateThresholds = DEFAULT_GATE,
): GateResult {
  const reasons: string[] = [];
  if (result.delta.costSavedPct < thresholds.minCostReductionPct) {
    reasons.push(
      `cost reduction ${result.delta.costSavedPct.toFixed(1)}% < ${thresholds.minCostReductionPct}%`,
    );
  }
  if (result.delta.verifiedRatio < thresholds.minQualityRatio) {
    reasons.push(
      `quality ratio ${result.delta.verifiedRatio.toFixed(2)} < ${thresholds.minQualityRatio}`,
    );
  }
  const baselineP95 = result.baseline.p95LatencyMs;
  if (
    baselineP95 > 0 &&
    result.candidate.p95LatencyMs / baselineP95 >
      thresholds.maxP95LatencyRatio
  ) {
    reasons.push(
      `p95 latency ratio ${(result.candidate.p95LatencyMs / baselineP95).toFixed(2)} > ${thresholds.maxP95LatencyRatio}`,
    );
  }
  return { pass: reasons.length === 0, reasons };
}
