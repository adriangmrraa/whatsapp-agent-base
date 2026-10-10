// ─── Provider-neutral decision contract ──────────────────────────────────────
//
// The transport-agnostic shape shared by every decision provider (Jev,
// OpenAI Decisions, rules). A provider takes a `state` (arbitrary text/JSON,
// text only) plus a typed `questions` pack and returns a typed `answers` map.
//
// This is a DIFFERENT contract from the per-turn `DecisionLayer` in
// `../types.ts`: that one returns a semantic `SystemOneDecision` for the
// WhatsApp/voice runtime, this one is the generic "bounded semantic decision"
// transport used by the JEV harness packs. The registry in `./registry.ts`
// resolves one of these; nothing here mutates state or touches the network.

export type QuestionType = "noul" | "choice" | "score";

/** Probability-of-yes question (absolute). Threshold lives in policy. */
export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

/** Pick-one question; `criteria` maps each option id to its description. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/** Ordered-rubric question; `criteria` is the level list, lowest→highest. */
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

/**
 * A named bag of questions. IDs are LOCAL keys (used to correlate answers) —
 * providers must put all meaning in `instructions`/`criteria`, because the
 * hosted APIs never send the id to the model.
 */
export type QuestionPack = Record<string, Question>;

/** Arbitrary provider input: a string, an object, or an array. Text only. */
export type State = string | Record<string, unknown> | unknown[];

export interface NoulAnswer {
  type: "noul";
  /** Probability of yes in [0, 1] — not a boolean. Calibrate before trusting. */
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, number>;
}

/**
 * Explicit non-answer. Used when a provider declines to answer a question —
 * an OpenAI Decisions `refusal`, or the deterministic `rules` fallback.
 * Consumers MUST treat it as "no signal"; protective packs then fail closed
 * through policy, and advisory packs proceed.
 */
export interface NoAnswer {
  type: "no-answer";
  reason: string;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer | NoAnswer;

/** Answer type for one question — the question type drives the answer type. */
export type AnswerForQuestion<Q extends Question> = Q extends NoulQuestion
  ? NoulAnswer | NoAnswer
  : Q extends ChoiceQuestion
    ? ChoiceAnswer | NoAnswer
    : Q extends ScoreQuestion
      ? ScoreAnswer | NoAnswer
      : never;

/** Typed answers keyed by the same ids as the question pack. */
export type AnswerMap<T extends QuestionPack> = {
  [K in keyof T]: AnswerForQuestion<T[K]>;
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface DecideOptions {
  /** Override the provider's configured model for this call. */
  model?: string;
  /** Per-call timeout in ms; overrides the provider default. */
  timeoutMs?: number;
}

export interface DecisionProvider {
  readonly name: string;
  decide<T extends QuestionPack>(
    state: State,
    questions: T,
    opts?: DecideOptions,
  ): Promise<AnswerMap<T>>;
}

export type DecisionProviderErrorCode =
  | "not_configured"
  | "http_error"
  | "timeout"
  | "malformed_response"
  | "missing_answer";

/**
 * Typed error for every provider anomaly. Network providers throw this on ANY
 * doubt (fail closed); the registry catches it and falls back to `rules`.
 * Message must never contain request/response bodies or secrets.
 */
export class DecisionProviderError extends Error {
  readonly code: DecisionProviderErrorCode;
  readonly status?: number;

  constructor(
    code: DecisionProviderErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "DecisionProviderError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** Narrowing guard for the explicit non-answer shape. */
export function isNoAnswer(answer: Answer): answer is NoAnswer {
  return answer.type === "no-answer";
}

/** Finite number guard — providers reject NaN/Infinity as malformed. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
