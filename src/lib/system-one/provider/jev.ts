import {
  DecisionProviderError,
  isFiniteNumber,
  type Answer,
  type AnswerMap,
  type DecideOptions,
  type DecisionProvider,
  type Question,
  type QuestionPack,
  type State,
} from "./types";

// ─── Jev (TypeSafe System One) provider adapter ──────────────────────────────
//
// Real contract:
//   POST {baseUrl}/v1/systemone
//   Authorization: Bearer $TYPESAFE_API_KEY   (alias $JEV_API_KEY)
//   { model, state, questions } → { model, answers, usage }
//
// Design rules:
// - Zero retries: the registry's circuit breaker + rules fallback own
//   resilience, not this adapter.
// - Throw `DecisionProviderError` on EVERY anomaly (non-2xx, bad JSON, a
//   missing/malformed answer) — that throw IS the registry's fallback trigger.
// - Never log the request or response body (it carries the caller's `state`,
//   which may contain tenant data before redaction).

export const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const JEV_DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 8_000;

export interface JevProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface JevResponseBody {
  model?: unknown;
  answers?: unknown;
  usage?: unknown;
}

function toAnswer(raw: unknown, question: Question): Answer {
  if (typeof raw !== "object" || raw === null) {
    throw new DecisionProviderError(
      "malformed_response",
      "jev: answer is not an object",
    );
  }
  const a = raw as Record<string, unknown>;

  if (question.type === "noul") {
    if (a.type !== "noul" || !isFiniteNumber(a.noul) || a.noul < 0 || a.noul > 1) {
      throw new DecisionProviderError(
        "malformed_response",
        "jev: malformed noul answer",
      );
    }
    return { type: "noul", noul: a.noul };
  }

  if (question.type === "choice") {
    if (a.type !== "choice" || typeof a.choice !== "string" || a.choice.length === 0) {
      throw new DecisionProviderError(
        "malformed_response",
        "jev: malformed choice answer",
      );
    }
    if (!(a.choice in question.criteria)) {
      throw new DecisionProviderError(
        "malformed_response",
        "jev: choice not in criteria",
      );
    }
    return {
      type: "choice",
      choice: a.choice,
      confidence: isFiniteNumber(a.confidence) ? a.confidence : undefined,
      probabilities: isProbabilities(a.probabilities),
    };
  }

  // score
  if (a.type !== "score" || !isFiniteNumber(a.score)) {
    throw new DecisionProviderError(
      "malformed_response",
      "jev: malformed score answer",
    );
  }
  return {
    type: "score",
    score: a.score,
    confidence: isFiniteNumber(a.confidence) ? a.confidence : undefined,
    probabilities: isProbabilities(a.probabilities),
    legend: isProbabilities(a.legend),
  };
}

function isProbabilities(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isFiniteNumber(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function createJevProvider(options: JevProviderOptions): DecisionProvider {
  const baseUrl = (options.baseUrl ?? JEV_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/v1/systemone`;
  const model = options.model ?? JEV_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchFn ?? fetch;

  async function decide<T extends QuestionPack>(
    state: State,
    questions: T,
    opts?: DecideOptions,
  ): Promise<AnswerMap<T>> {
    if (!options.apiKey) {
      throw new DecisionProviderError("not_configured", "jev: missing api key");
    }

    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: opts?.model ?? model,
          state,
          questions,
        }),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && error.name === "TimeoutError";
      throw new DecisionProviderError(
        timedOut ? "timeout" : "http_error",
        `jev: request failed (${timedOut ? "timeout" : "network"})`,
      );
    }

    if (!res.ok) {
      throw new DecisionProviderError(
        "http_error",
        `jev: request failed: ${res.status}`,
        res.status,
      );
    }

    let json: JevResponseBody;
    try {
      json = (await res.json()) as JevResponseBody;
    } catch {
      throw new DecisionProviderError(
        "malformed_response",
        "jev: response is not valid JSON",
      );
    }

    if (typeof json.answers !== "object" || json.answers === null) {
      throw new DecisionProviderError(
        "malformed_response",
        "jev: response is missing answers",
      );
    }

    const rawAnswers = json.answers as Record<string, unknown>;
    const out: Record<string, Answer> = {};
    for (const id of Object.keys(questions)) {
      const raw = rawAnswers[id];
      if (raw === undefined) {
        throw new DecisionProviderError(
          "missing_answer",
          `jev: no answer for "${id}"`,
        );
      }
      out[id] = toAnswer(raw, questions[id]);
    }
    return out as AnswerMap<T>;
  }

  return { name: "jev", decide };
}
