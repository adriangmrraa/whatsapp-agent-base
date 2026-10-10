import type { QuestionPack } from "../provider/types";
import {
  askPack,
  choiceOf,
  describeCandidate,
  noulOf,
  type PackCandidate,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #3 — skill-route ───────────────────────────────────────────────────
//
// Which skills apply to a task (plan §3.2 #3, §5 orchestrator). Multi-label:
// each candidate skill gets its own `noul` (several can apply), plus a primary
// `choice` (with a "none" fallback) for the single best match.
//
// Posture: OPEN (advisory). Over-selecting skills costs context; it must not
// block. On no signal we select nothing and route to "none".

export const SKILL_ROUTE_PACK_ID = "skill-route";
export const SKILL_ROUTE_POSTURE = "open" as const;

export const SKILL_ROUTE_THRESHOLDS = {
  /** Minimum `noul` for a skill to be considered applicable. */
  skillMin: 0.5,
} as const;

/** Fallback option for the primary-skill `choice`. */
export const SKILL_ROUTE_FALLBACK = "none";

const SKILL_PREFIX = "skill_";

export interface SkillRouteValue {
  /** All skills judged applicable (may be several). */
  skills: string[];
  /** The single best-matching skill, or "none". */
  primary: string;
}

function buildSkillCriteria(candidates: PackCandidate[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) {
    criteria[candidate.id] = candidate.text
      ? candidate.text.slice(0, 200)
      : `${candidate.id} skill`;
  }
  criteria[SKILL_ROUTE_FALLBACK] = "No listed skill applies";
  return criteria;
}

export function buildSkillRouteQuestions(
  candidates: PackCandidate[],
): QuestionPack {
  const questions: QuestionPack = {
    primary: {
      type: "choice",
      instructions:
        "Which single listed skill best matches the task? Choose one; use 'none' if no listed skill applies.",
      criteria: buildSkillCriteria(candidates),
    },
  };
  candidates.forEach((candidate, index) => {
    questions[`${SKILL_PREFIX}${index}`] = {
      type: "noul",
      instructions: `Does this skill apply to the task? Answer with the probability it is applicable. Skill — ${describeCandidate(candidate)}`,
    };
  });
  return questions;
}

export async function runSkillRoute(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<SkillRouteValue>> {
  const candidates = input.candidates ?? [];
  const questions = buildSkillRouteQuestions(candidates);
  const asked = await askPack(runtime, SKILL_ROUTE_PACK_ID, input, questions);

  const skills: string[] = [];
  candidates.forEach((candidate, index) => {
    const value = noulOf(asked.answers[`${SKILL_PREFIX}${index}`]);
    if (!asked.degraded && value !== undefined && value >= SKILL_ROUTE_THRESHOLDS.skillMin) {
      skills.push(candidate.id);
    }
  });

  const primaryChoice = choiceOf(asked.answers.primary);
  const knownIds = new Set(candidates.map((candidate) => candidate.id));
  const primary =
    !asked.degraded &&
    primaryChoice !== undefined &&
    (primaryChoice === SKILL_ROUTE_FALLBACK || knownIds.has(primaryChoice))
      ? primaryChoice
      : SKILL_ROUTE_FALLBACK;

  return {
    packId: SKILL_ROUTE_PACK_ID,
    posture: SKILL_ROUTE_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { skills, primary },
  };
}

export const skillRoutePack: PackDefinition<SkillRouteValue> = {
  id: SKILL_ROUTE_PACK_ID,
  posture: SKILL_ROUTE_POSTURE,
  run: runSkillRoute,
};
