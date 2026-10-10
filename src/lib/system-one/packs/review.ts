import type { QuestionPack } from "../provider/types";
import {
  askPack,
  noulOf,
  scoreOf,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #11 — review ───────────────────────────────────────────────────────
//
// Pre-merge diff review rubric (plan §3.2 #11): correctness, spec-fit,
// test-gap and radius are each `score`d on the same 0-4 rubric, plus one
// multi-label `noul` "blocking" flag. Scores are indices into REVIEW_CRITERIA.
//
// Posture: OPEN (advisory). Review output guides a human; it never blocks a
// merge by itself. On no signal we report no scores and no blocking issue.

export const REVIEW_PACK_ID = "review";
export const REVIEW_POSTURE = "open" as const;

export const REVIEW_THRESHOLDS = {
  /** Score index (0-based) at/below which a dimension is flagged weak. */
  weakScore: 2,
  /** At/above this `noul` a blocking correctness issue exists. */
  blockingMin: 0.5,
} as const;

export const REVIEW_CRITERIA: readonly string[] = [
  "broken",
  "weak",
  "acceptable",
  "good",
  "excellent",
];

export const REVIEW_DIMENSIONS = [
  "correctness",
  "specFit",
  "testGap",
  "radius",
] as const;

export interface ReviewValue {
  /** Per-dimension score index, when answered. */
  scores: Record<string, number | undefined>;
  /** True when a blocking correctness issue is present. */
  blocking: boolean;
  /** Dimensions scored at/below the weak threshold. */
  weak: string[];
}

const DIMENSION_INSTRUCTIONS: Record<string, string> = {
  correctness:
    "Rate the correctness of the diff: does it do what it should, without defects?",
  specFit:
    "Rate how well the diff fits the spec/design: does it implement exactly the agreed behavior?",
  testGap:
    "Rate the test coverage of the diff (higher is better, i.e. fewer gaps).",
  radius:
    "Rate how contained the blast radius is (higher is better, i.e. more local).",
};

export function buildReviewQuestions(): QuestionPack {
  const questions: QuestionPack = {
    blocking: {
      type: "noul",
      instructions:
        "Is there any blocking issue in the diff — a correctness bug or a spec violation that must be fixed before merge? Answer with the probability that a blocking issue exists.",
    },
  };
  for (const dimension of REVIEW_DIMENSIONS) {
    questions[dimension] = {
      type: "score",
      instructions: `${DIMENSION_INSTRUCTIONS[dimension]} Pick the closest level.`,
      criteria: [...REVIEW_CRITERIA],
    };
  }
  return questions;
}

export async function runReview(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<ReviewValue>> {
  const questions = buildReviewQuestions();
  const asked = await askPack(runtime, REVIEW_PACK_ID, input, questions);

  const scores: Record<string, number | undefined> = {};
  const weak: string[] = [];
  for (const dimension of REVIEW_DIMENSIONS) {
    const value = scoreOf(asked.answers[dimension]);
    scores[dimension] = value;
    if (!asked.degraded && value !== undefined && value <= REVIEW_THRESHOLDS.weakScore) {
      weak.push(dimension);
    }
  }

  const blockingValue = noulOf(asked.answers.blocking);
  const blocking =
    !asked.degraded &&
    blockingValue !== undefined &&
    blockingValue >= REVIEW_THRESHOLDS.blockingMin;

  return {
    packId: REVIEW_PACK_ID,
    posture: REVIEW_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { scores, blocking, weak },
  };
}

export const reviewPack: PackDefinition<ReviewValue> = {
  id: REVIEW_PACK_ID,
  posture: REVIEW_POSTURE,
  run: runReview,
};
