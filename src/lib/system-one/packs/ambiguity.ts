import type { QuestionPack } from "../provider/types";
import { noulThreshold, postureOf } from "../policy";
import {
  askPack,
  noulOf,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #5 — ambiguity ─────────────────────────────────────────────────────
//
// The ask-human gate (plan §3.3 #4, §5 `sdd-explore`/`sdd-spec`). Multi-label:
// multiple-meanings, missing-info, and contradiction each get their own `noul`.
//
// Posture: CLOSED (protective). No signal ⇒ ASK THE HUMAN (allow = false).
// Building the wrong thing is far costlier than one clarifying question.

export const AMBIGUITY_PACK_ID = "ambiguity";
export const AMBIGUITY_POSTURE = postureOf(AMBIGUITY_PACK_ID);

export const AMBIGUITY_THRESHOLDS = {
  /** At/above this `noul` the requirement is ambiguous. */
  ambiguousMin: noulThreshold(AMBIGUITY_PACK_ID, "ambiguous"),
  /** At/above this `noul` required information is missing. */
  missingInfoMin: noulThreshold(AMBIGUITY_PACK_ID, "missingInfo"),
  /** At/above this `noul` the requirements contradict each other. */
  contradictoryMin: noulThreshold(AMBIGUITY_PACK_ID, "contradictory"),
} as const;

export const AMBIGUITY_REASONS = {
  ambiguous: "ambiguous-requirement",
  missingInfo: "missing-information",
  contradictory: "contradictory-requirements",
} as const;

export interface AmbiguityValue {
  /** True when the human should be asked before proceeding. */
  askHuman: boolean;
  /** Deterministic reason labels that fired. */
  reasons: string[];
}

export function buildAmbiguityQuestions(): QuestionPack {
  return {
    ambiguous: {
      type: "noul",
      instructions:
        "Are there multiple materially different, plausible interpretations of the requirement such that two engineers could reasonably build different things? Answer with the probability the requirement is ambiguous.",
    },
    missingInfo: {
      type: "noul",
      instructions:
        "Is a required input, credential, data source or business decision absent — one that only the human requester can supply? Answer with the probability that information is missing.",
    },
    contradictory: {
      type: "noul",
      instructions:
        "Do the stated requirements or acceptance criteria contradict each other (satisfying one violates another)? Answer with the probability that they contradict.",
    },
  };
}

export async function runAmbiguity(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<AmbiguityValue>> {
  const questions = buildAmbiguityQuestions();
  const asked = await askPack(runtime, AMBIGUITY_PACK_ID, input, questions);

  const ambiguous = noulOf(asked.answers.ambiguous);
  const missingInfo = noulOf(asked.answers.missingInfo);
  const contradictory = noulOf(asked.answers.contradictory);

  const reasons: string[] = [];
  if (ambiguous !== undefined && ambiguous >= AMBIGUITY_THRESHOLDS.ambiguousMin) {
    reasons.push(AMBIGUITY_REASONS.ambiguous);
  }
  if (missingInfo !== undefined && missingInfo >= AMBIGUITY_THRESHOLDS.missingInfoMin) {
    reasons.push(AMBIGUITY_REASONS.missingInfo);
  }
  if (contradictory !== undefined && contradictory >= AMBIGUITY_THRESHOLDS.contradictoryMin) {
    reasons.push(AMBIGUITY_REASONS.contradictory);
  }

  const askHuman = asked.degraded || reasons.length > 0;

  return {
    packId: AMBIGUITY_PACK_ID,
    posture: AMBIGUITY_POSTURE,
    allow: !askHuman,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.degraded
      ? "ambiguity_degraded"
      : askHuman
        ? "ambiguity_flagged"
        : "ambiguity_clear",
    tokens: asked.tokens,
    value: { askHuman, reasons },
  };
}

export const ambiguityPack: PackDefinition<AmbiguityValue> = {
  id: AMBIGUITY_PACK_ID,
  posture: AMBIGUITY_POSTURE,
  run: runAmbiguity,
};
