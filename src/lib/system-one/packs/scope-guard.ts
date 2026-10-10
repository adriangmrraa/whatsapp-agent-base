import type { QuestionPack } from "../provider/types";
import {
  askPack,
  noulOf,
  type PackDefinition,
  type PackInput,
  type PackResult,
  type PackRuntime,
} from "./types";

// ─── Pack #6 — scope-guard ───────────────────────────────────────────────────
//
// Does the diff stay inside the approved proposal scope? (plan §3.2 #6, §5
// `sdd-apply`). Multi-label: in-scope, new-paths, unrelated-drift each get
// their own `noul` so the pack can report exactly what drifted.
//
// Posture: CLOSED (protective). No signal ⇒ DO NOT proceed. Building outside
// the agreed scope is the most expensive failure mode; uncertainty blocks.

export const SCOPE_GUARD_PACK_ID = "scope-guard";
export const SCOPE_GUARD_POSTURE = "closed" as const;

export const SCOPE_GUARD_THRESHOLDS = {
  /** Minimum `noul` for the diff to be considered in scope. */
  inScopeMin: 0.5,
  /** At/above this `noul` new (undesigned) paths are present. */
  newPathsMin: 0.5,
  /** At/above this `noul` unrelated changes are present. */
  unrelatedMin: 0.5,
} as const;

export const SCOPE_GUARD_FLAGS = {
  outOfScope: "out-of-scope",
  newPaths: "new-paths",
  unrelated: "unrelated-drift",
} as const;

export interface ScopeGuardValue {
  /** Drift labels that fired (subset of SCOPE_GUARD_FLAGS values). */
  drifts: string[];
  /** In-scope `noul`, when the provider answered. */
  inScope?: number;
}

export function buildScopeGuardQuestions(): QuestionPack {
  return {
    inScope: {
      type: "noul",
      instructions:
        "Does every change in the diff stay within the approved proposal/design scope for the task? Answer with the probability that the diff is in scope.",
    },
    newPaths: {
      type: "noul",
      instructions:
        "Does the diff touch files or paths that are NOT listed in the design's File Changes? Answer with the probability that undeclared paths are present.",
    },
    unrelated: {
      type: "noul",
      instructions:
        "Does the diff contain changes unrelated to the task (drive-by edits, formatting sweeps, refactors no one asked for)? Answer with the probability that unrelated drift is present.",
    },
  };
}

export async function runScopeGuard(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<ScopeGuardValue>> {
  const questions = buildScopeGuardQuestions();
  const asked = await askPack(runtime, SCOPE_GUARD_PACK_ID, input, questions);

  const inScope = noulOf(asked.answers.inScope);
  const newPaths = noulOf(asked.answers.newPaths);
  const unrelated = noulOf(asked.answers.unrelated);

  const drifts: string[] = [];
  if (inScope !== undefined && inScope < SCOPE_GUARD_THRESHOLDS.inScopeMin) {
    drifts.push(SCOPE_GUARD_FLAGS.outOfScope);
  }
  if (newPaths !== undefined && newPaths >= SCOPE_GUARD_THRESHOLDS.newPathsMin) {
    drifts.push(SCOPE_GUARD_FLAGS.newPaths);
  }
  if (unrelated !== undefined && unrelated >= SCOPE_GUARD_THRESHOLDS.unrelatedMin) {
    drifts.push(SCOPE_GUARD_FLAGS.unrelated);
  }

  const allow = !asked.degraded && drifts.length === 0;

  return {
    packId: SCOPE_GUARD_PACK_ID,
    posture: SCOPE_GUARD_POSTURE,
    allow,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.degraded
      ? "scope_guard_degraded"
      : drifts.length > 0
        ? "scope_guard_drift"
        : "scope_guard_clear",
    tokens: asked.tokens,
    value: { drifts, inScope },
  };
}

export const scopeGuardPack: PackDefinition<ScopeGuardValue> = {
  id: SCOPE_GUARD_PACK_ID,
  posture: SCOPE_GUARD_POSTURE,
  run: runScopeGuard,
};
