import type { QuestionPack } from "../provider/types";
import { noulThreshold, postureOf } from "../policy";
import {
  askPack,
  choiceOf,
  noulOf,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #8 — triage ────────────────────────────────────────────────────────
//
// Failure triage in the debugging loop (plan §3.3 #3): is a failing log a
// regression, a flake, an environment problem or a test bug? Primitive mix:
// one `choice` (with an explicit "unknown" fallback) + two `noul` questions.
//
// Posture: OPEN (advisory). A wrong triage costs debugging time; it must not
// block the loop. On no signal we report "unknown" and proceed.

export const TRIAGE_PACK_ID = "triage";
export const TRIAGE_POSTURE = postureOf(TRIAGE_PACK_ID);

export const TRIAGE_THRESHOLDS = {
  /** At/above this `noul` the failure blocks the task. */
  blockingMin: noulThreshold(TRIAGE_PACK_ID, "blocking"),
  /** At/above this `noul` a rerun is expected to pass (flake-like). */
  rerunableMin: noulThreshold(TRIAGE_PACK_ID, "rerunable"),
} as const;

/** Fallback option for the cause `choice` (always present in criteria). */
export const TRIAGE_FALLBACK = "unknown";

export const TRIAGE_CAUSE_CRITERIA: Record<string, string> = {
  regression: "A real code regression introduced by the change",
  flake: "A nondeterministic/flaky test unrelated to the change",
  environment: "A missing dependency, config or environment problem",
  test_bug: "The test itself is wrong (assertion or fixture bug)",
  [TRIAGE_FALLBACK]: "Cannot tell from the evidence",
};

export interface TriageValue {
  /** Classified failure cause (one of the criteria keys). */
  cause: string;
  /** True when the failure should block progress. */
  blocking: boolean;
  /** True when a rerun is likely to pass without code changes. */
  rerun: boolean;
}

export function buildTriageQuestions(failure: string): QuestionPack {
  const context = failure.slice(0, 2000);
  return {
    cause: {
      type: "choice",
      instructions: `Classify the failure below into exactly one cause. Failure evidence: ${context}`,
      criteria: TRIAGE_CAUSE_CRITERIA,
    },
    blocking: {
      type: "noul",
      instructions: `Given the failure evidence, does it indicate a real regression that should block the task? Answer with the probability it blocks. Failure evidence: ${context}`,
    },
    rerunable: {
      type: "noul",
      instructions: `Is a rerun likely to pass without any code change (flake-like)? Answer with the probability that a rerun passes. Failure evidence: ${context}`,
    },
  };
}

export async function runTriage(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<TriageValue>> {
  const questions = buildTriageQuestions(input.task);
  const asked = await askPack(runtime, TRIAGE_PACK_ID, input, questions);

  const causeChoice = choiceOf(asked.answers.cause);
  const cause =
    causeChoice && causeChoice in TRIAGE_CAUSE_CRITERIA
      ? causeChoice
      : TRIAGE_FALLBACK;

  const blockingValue = noulOf(asked.answers.blocking);
  const rerunValue = noulOf(asked.answers.rerunable);

  const blocking =
    !asked.degraded &&
    blockingValue !== undefined &&
    blockingValue >= TRIAGE_THRESHOLDS.blockingMin;
  const rerun =
    !asked.degraded &&
    rerunValue !== undefined &&
    rerunValue >= TRIAGE_THRESHOLDS.rerunableMin;

  return {
    packId: TRIAGE_PACK_ID,
    posture: TRIAGE_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { cause, blocking, rerun },
  };
}

export const triagePack: PackDefinition<TriageValue> = {
  id: TRIAGE_PACK_ID,
  posture: TRIAGE_POSTURE,
  run: runTriage,
};
