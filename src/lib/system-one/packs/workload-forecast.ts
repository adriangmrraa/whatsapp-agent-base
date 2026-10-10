import type { QuestionPack } from "../provider/types";
import { noulThreshold, postureOf, scoreThreshold } from "../policy";
import {
  askPack,
  noulOf,
  resolveThreshold,
  scoreOf,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #4 — workload-forecast ─────────────────────────────────────────────
//
// The 400-line risk / chained-PR forecast (plan §3.2 #4, §5 `sdd-tasks`). It
// emits the EXACT guard lines the SDD tasks phase looks for:
//   - "Decision needed before apply"
//   - "Chained PRs recommended"
//
// Primitive mix: one `score` (diff size on an ordered rubric) + two multi-label
// `noul` questions (chained-PR need, unresolved decision).
//
// Posture: OPEN (advisory). On no signal we emit no guard lines and let apply
// proceed; a bad forecast costs review effort, it must not block the workflow.

export const WORKLOAD_FORECAST_PACK_ID = "workload-forecast";
export const WORKLOAD_FORECAST_POSTURE = postureOf(WORKLOAD_FORECAST_PACK_ID);

export const WORKLOAD_FORECAST_THRESHOLDS = {
  /** Score index (0-based) at/above which the diff is flagged as large. */
  sizeWarn: scoreThreshold(WORKLOAD_FORECAST_PACK_ID, "sizeWarn"),
  /** At/above this `noul` chained PRs are recommended. */
  chainedMin: noulThreshold(WORKLOAD_FORECAST_PACK_ID, "chained"),
  /** At/above this `noul` a decision is needed before apply. */
  decisionMin: noulThreshold(WORKLOAD_FORECAST_PACK_ID, "decision"),
} as const;

/** Exact guard line emitted when a pre-apply decision is required. */
export const GUARD_DECISION_LINE = "Decision needed before apply";
/** Exact guard line emitted when the diff should be split into chained PRs. */
export const GUARD_CHAINED_LINE = "Chained PRs recommended";

export const WORKLOAD_SIZE_CRITERIA: readonly string[] = [
  "trivial (<50 changed lines)",
  "small (50-150 changed lines)",
  "medium (150-300 changed lines)",
  "large (300-400 changed lines)",
  "extra-large (>400 changed lines)",
];

export interface WorkloadForecastValue {
  /** Size score index into WORKLOAD_SIZE_CRITERIA, when answered. */
  sizeScore?: number;
  /** True when the change likely exceeds the single-PR budget. */
  chained: boolean;
  /** True when an unresolved decision blocks apply. */
  decisionNeeded: boolean;
  /** Human-readable size bucket, when answered. */
  sizeLabel?: string;
  /** The exact guard lines to print for the SDD tasks phase. */
  guardLines: string[];
}

export function buildWorkloadForecastQuestions(): QuestionPack {
  return {
    size: {
      type: "score",
      instructions:
        "Estimate the size of the change the task will produce, by total changed lines across all files. Pick the closest bucket.",
      criteria: [...WORKLOAD_SIZE_CRITERIA],
    },
    chained: {
      type: "noul",
      instructions:
        "Will this change exceed roughly 400 changed lines and therefore need to be split into chained (stacked) PRs? Answer with the probability that chaining is required.",
    },
    decisionNeeded: {
      type: "noul",
      instructions:
        "Is there an unresolved decision (an open ambiguity or a scope question) that must be settled before implementation can start? Answer with the probability that a decision is needed before apply.",
    },
  };
}

export async function runWorkloadForecast(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<WorkloadForecastValue>> {
  const questions = buildWorkloadForecastQuestions();
  const asked = await askPack(
    runtime,
    WORKLOAD_FORECAST_PACK_ID,
    input,
    questions,
  );

  const sizeScore = scoreOf(asked.answers.size);
  const chainedValue = noulOf(asked.answers.chained);
  const decisionValue = noulOf(asked.answers.decisionNeeded);

  const chainedMin = resolveThreshold(
    input,
    "chainedMin",
    WORKLOAD_FORECAST_THRESHOLDS.chainedMin,
  );
  const decisionMin = resolveThreshold(
    input,
    "decisionMin",
    WORKLOAD_FORECAST_THRESHOLDS.decisionMin,
  );

  const chained =
    !asked.degraded &&
    chainedValue !== undefined &&
    chainedValue >= chainedMin;
  const decisionNeeded =
    !asked.degraded &&
    decisionValue !== undefined &&
    decisionValue >= decisionMin;

  const guardLines: string[] = [];
  if (decisionNeeded) guardLines.push(GUARD_DECISION_LINE);
  if (chained) guardLines.push(GUARD_CHAINED_LINE);

  const sizeLabel =
    sizeScore !== undefined && sizeScore >= 0 && sizeScore < WORKLOAD_SIZE_CRITERIA.length
      ? WORKLOAD_SIZE_CRITERIA[sizeScore]
      : undefined;

  return {
    packId: WORKLOAD_FORECAST_PACK_ID,
    posture: WORKLOAD_FORECAST_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { sizeScore, chained, decisionNeeded, sizeLabel, guardLines },
  };
}

export const workloadForecastPack: PackDefinition<WorkloadForecastValue> = {
  id: WORKLOAD_FORECAST_PACK_ID,
  posture: WORKLOAD_FORECAST_POSTURE,
  run: runWorkloadForecast,
};
