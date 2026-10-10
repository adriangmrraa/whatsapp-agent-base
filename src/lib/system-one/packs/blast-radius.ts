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

// ─── Pack #10 — blast-radius ─────────────────────────────────────────────────
//
// Regression-risk / blast-radius estimate (plan §3.2 #10, §5 `sdd-design`).
// Primitive mix: one `score` (radius on an ordered rubric) + two multi-label
// `noul` questions (dependent modules, public/shared API change).
//
// Posture: OPEN (advisory). Risk estimate informs review depth; it must not
// block. On no signal we report no risk and no flags.

export const BLAST_RADIUS_PACK_ID = "blast-radius";
export const BLAST_RADIUS_POSTURE = "open" as const;

export const BLAST_RADIUS_THRESHOLDS = {
  /** Score index (0-based) at/above which the radius is flagged. */
  radiusWarn: 2,
  /** At/above this `noul` many dependent modules are affected. */
  dependentsMin: 0.5,
  /** At/above this `noul` a public/shared API or contract changes. */
  publicApiMin: 0.5,
} as const;

export const BLAST_RADIUS_CRITERIA: readonly string[] = [
  "local (single function/file)",
  "module (one module)",
  "package (one package/feature area)",
  "cross-package (several packages)",
  "repo-wide (shared infra or public API)",
];

export const BLAST_RADIUS_FLAGS = {
  wideRadius: "wide-radius",
  manyDependents: "many-dependents",
  publicApi: "public-api-change",
} as const;

export interface BlastRadiusValue {
  /** Radius score index into BLAST_RADIUS_CRITERIA, when answered. */
  radiusScore?: number;
  /** Human-readable radius bucket, when answered. */
  radiusLabel?: string;
  /** True when the change is judged high-risk. */
  highRisk: boolean;
  /** Risk labels that fired. */
  flags: string[];
}

export function buildBlastRadiusQuestions(): QuestionPack {
  return {
    radius: {
      type: "score",
      instructions:
        "How wide is the blast radius of the change — how much of the codebase can it affect? Pick the closest bucket.",
      criteria: [...BLAST_RADIUS_CRITERIA],
    },
    dependents: {
      type: "noul",
      instructions:
        "Do many other modules depend on the code being changed? Answer with the probability that there are many dependents.",
    },
    publicApi: {
      type: "noul",
      instructions:
        "Does the change alter a public or shared API, contract, schema or configuration that others rely on? Answer with the probability that a public contract changes.",
    },
  };
}

export async function runBlastRadius(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<BlastRadiusValue>> {
  const questions = buildBlastRadiusQuestions();
  const asked = await askPack(runtime, BLAST_RADIUS_PACK_ID, input, questions);

  const radiusScore = scoreOf(asked.answers.radius);
  const dependents = noulOf(asked.answers.dependents);
  const publicApi = noulOf(asked.answers.publicApi);

  const flags: string[] = [];
  if (
    !asked.degraded &&
    radiusScore !== undefined &&
    radiusScore >= BLAST_RADIUS_THRESHOLDS.radiusWarn
  ) {
    flags.push(BLAST_RADIUS_FLAGS.wideRadius);
  }
  if (
    !asked.degraded &&
    dependents !== undefined &&
    dependents >= BLAST_RADIUS_THRESHOLDS.dependentsMin
  ) {
    flags.push(BLAST_RADIUS_FLAGS.manyDependents);
  }
  if (
    !asked.degraded &&
    publicApi !== undefined &&
    publicApi >= BLAST_RADIUS_THRESHOLDS.publicApiMin
  ) {
    flags.push(BLAST_RADIUS_FLAGS.publicApi);
  }

  const radiusLabel =
    radiusScore !== undefined && radiusScore >= 0 && radiusScore < BLAST_RADIUS_CRITERIA.length
      ? BLAST_RADIUS_CRITERIA[radiusScore]
      : undefined;

  return {
    packId: BLAST_RADIUS_PACK_ID,
    posture: BLAST_RADIUS_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: {
      radiusScore,
      radiusLabel,
      highRisk: flags.length > 0,
      flags,
    },
  };
}

export const blastRadiusPack: PackDefinition<BlastRadiusValue> = {
  id: BLAST_RADIUS_PACK_ID,
  posture: BLAST_RADIUS_POSTURE,
  run: runBlastRadius,
};
