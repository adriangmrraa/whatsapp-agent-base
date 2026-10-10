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

// ─── Pack #1 — context-prime ─────────────────────────────────────────────────
//
// Highest-leverage pack (plan §3.3): given a task and a set of candidate
// excerpts (Engram memories, doc sections, skill rules), decide which ones
// enter the working context. It is a per-candidate `noul` rerank plus one
// multi-label "coverage" `noul` that flags whether more retrieval is needed.
//
// Posture: OPEN (advisory). Selecting too much context wastes tokens but never
// blocks work; on no signal we keep every candidate (fail-open).

export const CONTEXT_PRIME_PACK_ID = "context-prime";
export const CONTEXT_PRIME_POSTURE = postureOf(CONTEXT_PRIME_PACK_ID);

export const CONTEXT_PRIME_THRESHOLDS = {
  /** Minimum `noul` to inject a candidate excerpt. */
  candidateMin: noulThreshold(CONTEXT_PRIME_PACK_ID, "candidate"),
  /** Below this coverage `noul` the pack flags insufficient context. */
  coverageMin: noulThreshold(CONTEXT_PRIME_PACK_ID, "coverage"),
} as const;

const SELECT_PREFIX = "select_";

export interface ContextPrimeValue {
  /** Candidate ids selected for injection (above threshold). */
  selected: string[];
  /** Candidate ids omitted (below threshold). */
  omitted: string[];
  /** Coverage `noul`, when the provider answered. */
  coverage?: number;
  /** True when the model thinks the context is too thin to start work. */
  insufficient: boolean;
}

export function buildContextPrimeQuestions(
  candidates: PackCandidate[],
): QuestionPack {
  const questions: QuestionPack = {
    coverage: {
      type: "noul",
      instructions:
        "Given the task and the candidate excerpts, do they collectively cover enough of the task that no further retrieval is needed before starting? Answer with the probability that coverage is sufficient.",
    },
  };
  candidates.forEach((candidate, index) => {
    questions[`${SELECT_PREFIX}${index}`] = {
      type: "noul",
      instructions: `Should this candidate be injected into the working context for the task? Answer with the probability it is relevant enough to include. Candidate — ${describeCandidate(candidate)}`,
    };
  });
  return questions;
}

export async function runContextPrime(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<ContextPrimeValue>> {
  const candidates = input.candidates ?? [];
  const questions = buildContextPrimeQuestions(candidates);
  const asked = await askPack(runtime, CONTEXT_PRIME_PACK_ID, input, questions);

  const coverage = noulOf(asked.answers.coverage);
  const selected: string[] = [];
  const omitted: string[] = [];

  candidates.forEach((candidate, index) => {
    const value = noulOf(asked.answers[`${SELECT_PREFIX}${index}`]);
    if (asked.degraded || value === undefined) {
      selected.push(candidate.id);
      return;
    }
    if (value >= CONTEXT_PRIME_THRESHOLDS.candidateMin) selected.push(candidate.id);
    else omitted.push(candidate.id);
  });

  const insufficient =
    coverage !== undefined && coverage < CONTEXT_PRIME_THRESHOLDS.coverageMin;

  return {
    packId: CONTEXT_PRIME_PACK_ID,
    posture: CONTEXT_PRIME_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { selected, omitted, coverage, insufficient },
  };
}

export const contextPrimePack: PackDefinition<ContextPrimeValue> = {
  id: CONTEXT_PRIME_PACK_ID,
  posture: CONTEXT_PRIME_POSTURE,
  run: runContextPrime,
};
