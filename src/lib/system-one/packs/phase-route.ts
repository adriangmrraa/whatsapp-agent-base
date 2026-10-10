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

// ─── Pack #13 — phase-route ──────────────────────────────────────────────────
//
// Which SDD phase comes next (plan §3.2 #13, orchestrator DAG). One `choice`
// over the SDD phase set (with a "none" fallback) + two multi-label `noul`
// questions (ready-to-advance, blocked).
//
// Posture: OPEN (advisory). The orchestrator still owns the DAG; this pack only
// suggests the next hop. On no signal we route to "none" and do not advance.

export const PHASE_ROUTE_PACK_ID = "phase-route";
export const PHASE_ROUTE_POSTURE = postureOf(PHASE_ROUTE_PACK_ID);

export const PHASE_ROUTE_THRESHOLDS = {
  /** At/above this `noul` the current phase is complete enough to advance. */
  readyMin: noulThreshold(PHASE_ROUTE_PACK_ID, "ready"),
  /** At/above this `noul` the current phase is blocked on missing input. */
  blockedMin: noulThreshold(PHASE_ROUTE_PACK_ID, "blocked"),
} as const;

/** Fallback option for the next-phase `choice`. */
export const PHASE_ROUTE_FALLBACK = "none";

export const PHASE_ROUTE_CRITERIA: Record<string, string> = {
  explore: "Explore the idea / clarify requirements",
  propose: "Write the change proposal",
  spec: "Write delta specifications",
  design: "Write the technical design",
  tasks: "Break the design into tasks",
  apply: "Implement the tasks",
  verify: "Verify implementation against the spec",
  archive: "Archive the completed change",
  done: "The change is complete",
  [PHASE_ROUTE_FALLBACK]: "Cannot determine the next phase",
};

export interface PhaseRouteValue {
  /** Suggested next phase (one of the criteria keys). */
  nextPhase: string;
  /** True when the current phase looks complete enough to advance. */
  ready: boolean;
  /** True when the current phase is blocked on missing input. */
  blocked: boolean;
}

export function buildPhaseRouteQuestions(): QuestionPack {
  return {
    nextPhase: {
      type: "choice",
      instructions:
        "Given the current SDD state, which single phase should run next? Choose one; use 'none' if it cannot be determined.",
      criteria: PHASE_ROUTE_CRITERIA,
    },
    ready: {
      type: "noul",
      instructions:
        "Is the current SDD phase complete enough that the workflow can advance to the next phase? Answer with the probability that it is ready to advance.",
    },
    blocked: {
      type: "noul",
      instructions:
        "Is the current SDD phase blocked on missing input or an unresolved decision? Answer with the probability that it is blocked.",
    },
  };
}

export async function runPhaseRoute(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<PhaseRouteValue>> {
  const questions = buildPhaseRouteQuestions();
  const asked = await askPack(runtime, PHASE_ROUTE_PACK_ID, input, questions);

  const nextChoice = choiceOf(asked.answers.nextPhase);
  const nextPhase =
    !asked.degraded && nextChoice !== undefined && nextChoice in PHASE_ROUTE_CRITERIA
      ? nextChoice
      : PHASE_ROUTE_FALLBACK;

  const readyValue = noulOf(asked.answers.ready);
  const blockedValue = noulOf(asked.answers.blocked);

  const ready =
    !asked.degraded &&
    readyValue !== undefined &&
    readyValue >= PHASE_ROUTE_THRESHOLDS.readyMin;
  const blocked =
    !asked.degraded &&
    blockedValue !== undefined &&
    blockedValue >= PHASE_ROUTE_THRESHOLDS.blockedMin;

  return {
    packId: PHASE_ROUTE_PACK_ID,
    posture: PHASE_ROUTE_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { nextPhase, ready, blocked },
  };
}

export const phaseRoutePack: PackDefinition<PhaseRouteValue> = {
  id: PHASE_ROUTE_PACK_ID,
  posture: PHASE_ROUTE_POSTURE,
  run: runPhaseRoute,
};
