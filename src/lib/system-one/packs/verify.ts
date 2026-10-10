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

// ─── Pack #12 — verify ───────────────────────────────────────────────────────
//
// Verification gate: do the claimed results match the evidence? (plan §3.2 #12,
// §5 `sdd-verify`). A `choice` for the evidence type (with a "none" fallback)
// + two multi-label `noul` questions (evidence strength, claim↔evidence fit).
//
// Posture: OPEN (ADVISORY ONLY). Tests are the ground truth; this pack can only
// warn that a claim looks unsupported. It never blocks. On no signal we report
// the claim unsupported and the evidence type as "none".

export const VERIFY_PACK_ID = "verify";
export const VERIFY_POSTURE = postureOf(VERIFY_PACK_ID);

export const VERIFY_THRESHOLDS = {
  /** Minimum `noul` for the evidence to be considered adequate. */
  evidenceMin: noulThreshold(VERIFY_PACK_ID, "evidence"),
  /** Minimum `noul` for the claim to match the evidence. */
  matchesMin: noulThreshold(VERIFY_PACK_ID, "matches"),
} as const;

/** Fallback option for the evidence-type `choice`. */
export const VERIFY_FALLBACK = "none";

export const VERIFY_EVIDENCE_CRITERIA: Record<string, string> = {
  tests: "Test output from a real run",
  build: "A build/typecheck result",
  lint: "A lint result",
  manual: "A manual observation by a human or agent",
  [VERIFY_FALLBACK]: "No evidence of any kind",
};

export interface VerifyValue {
  /** True when the evidence is judged to support the claim. */
  supported: boolean;
  /** Evidence type backing the claim (one of the criteria keys). */
  evidenceType: string;
  /** Always true — this pack's output is advisory; tests remain the authority. */
  advisoryOnly: true;
}

export function buildVerifyQuestions(): QuestionPack {
  return {
    evidence: {
      type: "noul",
      instructions:
        "Does concrete evidence (real command output, test result or observed behavior) back the claim being verified, rather than only an assertion? Answer with the probability that adequate evidence exists.",
    },
    matches: {
      type: "noul",
      instructions:
        "Does the stated claim actually match what the evidence shows, without overreach or unstated assumptions? Answer with the probability that the claim matches the evidence.",
    },
    external: {
      type: "choice",
      instructions:
        "What kind of evidence backs the claim? Choose one; use 'none' if there is no evidence.",
      criteria: VERIFY_EVIDENCE_CRITERIA,
    },
  };
}

export async function runVerify(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<VerifyValue>> {
  const questions = buildVerifyQuestions();
  const asked = await askPack(runtime, VERIFY_PACK_ID, input, questions);

  const evidence = noulOf(asked.answers.evidence);
  const matches = noulOf(asked.answers.matches);

  const evidenceTypeChoice = choiceOf(asked.answers.external);
  const evidenceType =
    evidenceTypeChoice && evidenceTypeChoice in VERIFY_EVIDENCE_CRITERIA
      ? evidenceTypeChoice
      : VERIFY_FALLBACK;

  const supported =
    !asked.degraded &&
    evidence !== undefined &&
    evidence >= VERIFY_THRESHOLDS.evidenceMin &&
    matches !== undefined &&
    matches >= VERIFY_THRESHOLDS.matchesMin;

  return {
    packId: VERIFY_PACK_ID,
    posture: VERIFY_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { supported, evidenceType, advisoryOnly: true },
  };
}

export const verifyPack: PackDefinition<VerifyValue> = {
  id: VERIFY_PACK_ID,
  posture: VERIFY_POSTURE,
  run: runVerify,
};
