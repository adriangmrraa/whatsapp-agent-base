import type { QuestionPack } from "../provider/types";
import { noulThreshold, postureOf } from "../policy";
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

// ─── Pack #9 — acceptance ────────────────────────────────────────────────────
//
// Acceptance coverage: for every spec scenario, is there a passing covering
// test? (plan §3.3 #5, §5 `sdd-verify`). Tests stay the authority; this pack
// makes the compliance matrix honest instead of letting a model judge itself.
//
// Posture: OPEN (advisory). On no signal we mark every scenario uncovered and
// incomplete — conservative, but it never blocks (the gate does that).

export const ACCEPTANCE_PACK_ID = "acceptance";
export const ACCEPTANCE_POSTURE = postureOf(ACCEPTANCE_PACK_ID);

export const ACCEPTANCE_THRESHOLDS = {
  /** Minimum `noul` for a scenario to count as covered by a passing test. */
  scenarioMin: noulThreshold(ACCEPTANCE_PACK_ID, "scenario"),
  /** Below this `noul` coverage is judged incomplete. */
  completeMin: noulThreshold(ACCEPTANCE_PACK_ID, "complete"),
} as const;

const COVER_PREFIX = "cover_";

export interface AcceptanceValue {
  /** Scenario ids judged covered by a passing test. */
  covered: string[];
  /** Scenario ids judged uncovered. */
  uncovered: string[];
  /** True when coverage is judged incomplete. */
  complete: boolean;
}

export function buildAcceptanceQuestions(
  scenarios: PackCandidate[],
): QuestionPack {
  const questions: QuestionPack = {
    complete: {
      type: "noul",
      instructions:
        "Taken together, do the existing tests adequately cover all of the listed spec scenarios? Answer with the probability that coverage is complete.",
    },
  };
  scenarios.forEach((scenario, index) => {
    questions[`${COVER_PREFIX}${index}`] = {
      type: "noul",
      instructions: `Is there a passing test that covers this spec scenario? Answer with the probability that a passing covering test exists. Scenario — ${describeCandidate(scenario)}`,
    };
  });
  return questions;
}

export async function runAcceptance(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<AcceptanceValue>> {
  const scenarios = input.candidates ?? [];
  const questions = buildAcceptanceQuestions(scenarios);
  const asked = await askPack(runtime, ACCEPTANCE_PACK_ID, input, questions);

  const covered: string[] = [];
  const uncovered: string[] = [];
  scenarios.forEach((scenario, index) => {
    const value = noulOf(asked.answers[`${COVER_PREFIX}${index}`]);
    if (!asked.degraded && value !== undefined && value >= ACCEPTANCE_THRESHOLDS.scenarioMin) {
      covered.push(scenario.id);
    } else {
      uncovered.push(scenario.id);
    }
  });

  const completeValue = noulOf(asked.answers.complete);
  const complete =
    !asked.degraded &&
    completeValue !== undefined &&
    completeValue >= ACCEPTANCE_THRESHOLDS.completeMin;

  return {
    packId: ACCEPTANCE_PACK_ID,
    posture: ACCEPTANCE_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { covered, uncovered, complete },
  };
}

export const acceptancePack: PackDefinition<AcceptanceValue> = {
  id: ACCEPTANCE_PACK_ID,
  posture: ACCEPTANCE_POSTURE,
  run: runAcceptance,
};
