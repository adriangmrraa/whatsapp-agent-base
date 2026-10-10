import type { QuestionPack } from "../provider/types";
import {
  askPack,
  describeCandidate,
  noulOf,
  type PackCandidate,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #7 — test-impact ───────────────────────────────────────────────────
//
// "Which of the N test files exercise this diff?" (plan §3.3 #2). A
// per-candidate `noul` rerank over test files, plus one multi-label
// "regression" `noul` that decides whether the full suite should run anyway.
//
// Posture: OPEN (advisory). Running too many tests is safe; on no signal we
// select every candidate and recommend the full suite (fail-open, conservative).

export const TEST_IMPACT_PACK_ID = "test-impact";
export const TEST_IMPACT_POSTURE = "open" as const;

export const TEST_IMPACT_THRESHOLDS = {
  /** Minimum `noul` for a test file to be selected. */
  testMin: 0.4,
  /** At/above this `noul` the full suite should run. */
  regressionMin: 0.6,
} as const;

const TEST_PREFIX = "test_";

export interface TestImpactValue {
  /** Test file paths selected to run. */
  tests: string[];
  /** True when the full suite should run regardless of selection. */
  runFullSuite: boolean;
}

export function buildTestImpactQuestions(
  candidates: PackCandidate[],
): QuestionPack {
  const questions: QuestionPack = {
    regression: {
      type: "noul",
      instructions:
        "Does this change carry cross-cutting regression risk that warrants running the full test suite rather than a selected subset? Answer with the probability that the full suite is needed.",
    },
  };
  candidates.forEach((candidate, index) => {
    questions[`${TEST_PREFIX}${index}`] = {
      type: "noul",
      instructions: `Does this test file exercise code that the task changes? Answer with the probability it should be run. Candidate — ${describeCandidate(candidate)}`,
    };
  });
  return questions;
}

export async function runTestImpact(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<TestImpactValue>> {
  const candidates = input.candidates ?? [];
  const questions = buildTestImpactQuestions(candidates);
  const asked = await askPack(runtime, TEST_IMPACT_PACK_ID, input, questions);

  const tests: string[] = [];
  candidates.forEach((candidate, index) => {
    const value = noulOf(asked.answers[`${TEST_PREFIX}${index}`]);
    if (asked.degraded || value === undefined) {
      tests.push(candidate.id);
      return;
    }
    if (value >= TEST_IMPACT_THRESHOLDS.testMin) tests.push(candidate.id);
  });

  const regression = noulOf(asked.answers.regression);
  const runFullSuite =
    asked.degraded ||
    (regression !== undefined && regression >= TEST_IMPACT_THRESHOLDS.regressionMin);

  return {
    packId: TEST_IMPACT_PACK_ID,
    posture: TEST_IMPACT_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { tests, runFullSuite },
  };
}

export const testImpactPack: PackDefinition<TestImpactValue> = {
  id: TEST_IMPACT_PACK_ID,
  posture: TEST_IMPACT_POSTURE,
  run: runTestImpact,
};
