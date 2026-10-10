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

// ─── Pack #2 — file-scope ────────────────────────────────────────────────────
//
// Which files/folders are affected (plan §3.2 #2). Per-candidate `noul` rerank
// plus a folder `choice` (with an explicit "other" fallback) and a `covered`
// `noul` that stops the model from being forced to pick a winner when none of
// the candidates actually applies (anti-forced-winner).
//
// Posture: OPEN (advisory). On no signal we keep every candidate and mark the
// set incomplete so a human/inspector still sees the uncertainty.

export const FILE_SCOPE_PACK_ID = "file-scope";
export const FILE_SCOPE_POSTURE = "open" as const;

export const FILE_SCOPE_THRESHOLDS = {
  /** Minimum `noul` for a candidate file to be considered in scope. */
  fileMin: 0.4,
  /** Below this `covered` `noul` the candidate set under-covers the task. */
  coveredMin: 0.5,
} as const;

/** Fallback option for the folder `choice` (always present in criteria). */
export const FILE_SCOPE_FOLDER_FALLBACK = "other";

const FILE_PREFIX = "file_";

export const FILE_SCOPE_FOLDER_CRITERIA: Record<string, string> = {
  src: "Application/library source under src/",
  app: "Routes, pages or API handlers",
  db: "Database schema, migrations or queries",
  ui: "React components, styles or design system",
  lib: "Shared utilities/helpers outside src/app",
  tests: "Test files, fixtures or test configuration",
  config: "Build, tooling, dependency or CI configuration",
  docs: "Documentation or markdown only",
  [FILE_SCOPE_FOLDER_FALLBACK]: "None of the above / cannot tell",
};

export interface FileScopeValue {
  /** Candidate file paths likely to change. */
  files: string[];
  /** Most likely folder bucket (one of the criteria keys). */
  folder: string;
  /** True when the candidate set is judged to under-cover the task. */
  incomplete: boolean;
}

export function buildFileScopeQuestions(candidates: PackCandidate[]): QuestionPack {
  const questions: QuestionPack = {
    folder: {
      type: "choice",
      instructions:
        "Which folder bucket most likely contains the primary change for the task? Prefer the most specific bucket; use 'other' if none apply. Choose one.",
      criteria: FILE_SCOPE_FOLDER_CRITERIA,
    },
    covered: {
      type: "noul",
      instructions:
        "Do the listed candidate files cover the full scope of the task, or is the set incomplete? Answer with the probability that the set is complete.",
    },
  };
  candidates.forEach((candidate, index) => {
    questions[`${FILE_PREFIX}${index}`] = {
      type: "noul",
      instructions: `Is this file likely to require changes for the task? Answer with the probability it is in scope. Candidate — ${describeCandidate(candidate)}`,
    };
  });
  return questions;
}

export async function runFileScope(
  input: PackInput,
  runtime: PackRuntime,
): Promise<PackResult<FileScopeValue>> {
  const candidates = input.candidates ?? [];
  const questions = buildFileScopeQuestions(candidates);
  const asked = await askPack(runtime, FILE_SCOPE_PACK_ID, input, questions);

  const files: string[] = [];
  candidates.forEach((candidate, index) => {
    const value = noulOf(asked.answers[`${FILE_PREFIX}${index}`]);
    if (asked.degraded || value === undefined) {
      files.push(candidate.id);
      return;
    }
    if (value >= FILE_SCOPE_THRESHOLDS.fileMin) files.push(candidate.id);
  });

  const folderChoice = choiceOf(asked.answers.folder);
  const folder =
    folderChoice && folderChoice in FILE_SCOPE_FOLDER_CRITERIA
      ? folderChoice
      : FILE_SCOPE_FOLDER_FALLBACK;

  const covered = noulOf(asked.answers.covered);
  const incomplete = asked.degraded
    ? true
    : covered !== undefined && covered < FILE_SCOPE_THRESHOLDS.coveredMin;

  return {
    packId: FILE_SCOPE_PACK_ID,
    posture: FILE_SCOPE_POSTURE,
    allow: true,
    degraded: asked.degraded,
    provider: asked.provider,
    reason: asked.reason,
    tokens: asked.tokens,
    value: { files, folder, incomplete },
  };
}

export const fileScopePack: PackDefinition<FileScopeValue> = {
  id: FILE_SCOPE_PACK_ID,
  posture: FILE_SCOPE_POSTURE,
  run: runFileScope,
};
