import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import { isNoAnswer } from "../provider/types";
import type { ContextPrimer, PrimerCandidate } from "../context/primer";

// ─── Pack framework — one decision recipe per file ───────────────────────────
//
// Every pack is a pure recipe: typed `questions` + numeric `thresholds` in the
// SAME file, plus a `run(input, runtime)` that
//   1. primes `state` with the ContextPrimer (Engram memory + rules + candidates),
//   2. asks the DecisionProvider (Jev / OpenAI Decisions / rules),
//   3. maps the typed answers to a deterministic `PackResult` using the pack's
//      own thresholds and fail posture.
//
// Rules carried from the plan (§3.4):
// - thresholds never live outside the pack (one file per recipe);
// - every `choice` question declares a fallback option;
// - multi-label decisions use several `noul` questions, never one `choice`;
// - a pack is ADVISORY unless its posture is `closed`; protective packs fail
//   CLOSED (no signal ⇒ do not proceed), advisory packs fail OPEN.
//
// The pack functions are pure: no globals, no env reads, no network. The only
// inputs are the `PackInput` and the injected `PackRuntime`.

export type FailPosture = "open" | "closed";

export interface PackCandidate {
  /** Stable id (file path, memory id, skill name, scenario id, test path, ...). */
  id: string;
  /** Optional excerpt shown to the model (kept short — state is billed). */
  text?: string;
  /** Optional kind label (file | memory | skill | scenario | test | ...). */
  kind?: string;
}

export interface PackInput {
  task: string;
  candidates?: PackCandidate[];
  facts?: Record<string, unknown>;
  rules?: string[];
  queries?: string[];
  budgetTokens?: number;
  project?: string;
}

/** The two collaborators every pack consumes. */
export interface PackRuntime {
  primer: ContextPrimer;
  provider: DecisionProvider;
}

export interface PackAnswers<T extends QuestionPack> {
  answers: AnswerMap<T>;
  provider: string;
  /** True when the provider declined/errored on at least one question. */
  degraded: boolean;
  /** Deterministic reason code: "decided" | "no_answer" | "provider_error". */
  reason: string;
  /** The primed state that was sent to the provider. */
  state: State;
  /** Estimated tokens of the primed state. */
  tokens: number;
}

export interface PackResult<V> {
  packId: string;
  posture: FailPosture;
  /** Whether the caller may proceed (protective packs block; advisory allow). */
  allow: boolean;
  /** True when the provider gave no usable signal (no-answer or error). */
  degraded: boolean;
  provider: string;
  /** Deterministic reason code. */
  reason: string;
  /** Estimated tokens of the primed state. */
  tokens: number;
  /** Pack-specific, typed outcome. */
  value: V;
}

export interface PackDefinition<V = unknown> {
  id: string;
  posture: FailPosture;
  run(input: PackInput, runtime: PackRuntime): Promise<PackResult<V>>;
}

const MAX_SNIPPET = 280;

function toPrimerCandidates(
  candidates?: PackCandidate[],
): PrimerCandidate[] | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  return candidates.map((candidate) => ({
    path: candidate.id,
    snippet: candidate.text,
  }));
}

/** Human-readable candidate description embedded in `instructions`. */
export function describeCandidate(candidate: PackCandidate): string {
  const kind = candidate.kind ? `${candidate.kind} ` : "";
  const text = candidate.text
    ? `: ${candidate.text.slice(0, MAX_SNIPPET)}`
    : "";
  return `${kind}${candidate.id}${text}`;
}

/** A no-answer for every question (used when the provider errors). */
export function noAnswerMap<T extends QuestionPack>(questions: T): AnswerMap<T> {
  const out: Record<string, Answer> = {};
  for (const id of Object.keys(questions)) {
    out[id] = { type: "no-answer", reason: "unavailable" };
  }
  return out as AnswerMap<T>;
}

/**
 * Prime `state` and ask the provider. Never throws: a provider error is turned
 * into an all-`no-answer` response so the pack's fail posture decides the rest.
 */
export async function askPack<T extends QuestionPack>(
  runtime: PackRuntime,
  packId: string,
  input: PackInput,
  questions: T,
): Promise<PackAnswers<T>> {
  const primed = await runtime.primer.build(packId, {
    task: input.task,
    queries: input.queries,
    rules: input.rules,
    facts: input.facts,
    budgetTokens: input.budgetTokens,
    project: input.project,
    candidates: toPrimerCandidates(input.candidates),
  });

  try {
    const answers = await runtime.provider.decide(primed.state, questions);
    let degraded = false;
    for (const id of Object.keys(questions)) {
      if (isNoAnswer(answers[id as keyof T] as Answer)) {
        degraded = true;
        break;
      }
    }
    return {
      answers,
      provider: runtime.provider.name,
      degraded,
      reason: degraded ? "no_answer" : "decided",
      state: primed.state,
      tokens: primed.tokens,
    };
  } catch {
    return {
      answers: noAnswerMap(questions),
      provider: runtime.provider.name,
      degraded: true,
      reason: "provider_error",
      state: primed.state,
      tokens: primed.tokens,
    };
  }
}

export function noulOf(answer: Answer | undefined): number | undefined {
  return answer && answer.type === "noul" ? answer.noul : undefined;
}

export function choiceOf(answer: Answer | undefined): string | undefined {
  return answer && answer.type === "choice" ? answer.choice : undefined;
}

export function scoreOf(answer: Answer | undefined): number | undefined {
  return answer && answer.type === "score" ? answer.score : undefined;
}

/** Whether a degraded (no-signal) decision still lets the caller proceed. */
export function allowsWhenDegraded(posture: FailPosture): boolean {
  return posture === "open";
}

/** Clamp a noul into [0, 1] so a misbehaving provider cannot skew thresholds. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
