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

// ─── OpenAI Decisions provider adapter ───────────────────────────────────────
//
// Real contract (public beta):
//   POST {baseUrl}/v1/decisions
//   Authorization: Bearer $OPENAI_API_KEY
//   { model, input, questions: [ { type, name, instructions, choices|levels } ] }
//   → { answers: [ { name, ... } ] }            (or a top-level `refusal`)
//
// Type mapping (provider-neutral ↔ wire):
//   noul  ↔ predicate   (a boolean; there is NO calibration contract, so a
//                        bool maps to noul ∈ {0,1} and the number is treated
//                        as a score to be thresholded on your own data)
//   choice ↔ choice
//   score  ↔ score
//
// A `refusal` is a first-class outcome, not an error: it becomes a
// `NoAnswer` so policy can route to review/human. Every OTHER anomaly throws
// `DecisionProviderError` (the registry's fallback trigger).

export const OPENAI_DECISIONS_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DECISIONS_DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface OpenAiDecisionsProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface WireQuestion {
  type: "predicate" | "choice" | "score";
  name: string;
  instructions: string;
  choices?: Record<string, string>;
  levels?: string[];
}

interface OpenAiResponseBody {
  answers?: unknown;
  refusal?: unknown;
}

function toWireQuestion(id: string, question: Question): WireQuestion {
  if (question.type === "noul") {
    return {
      type: "predicate",
      name: id,
      instructions: question.instructions,
    };
  }
  if (question.type === "choice") {
    return {
      type: "choice",
      name: id,
      instructions: question.instructions,
      choices: question.criteria,
    };
  }
  return {
    type: "score",
    name: id,
    instructions: question.instructions,
    levels: question.criteria,
  };
}

function refusalAnswer(reason: string): Answer {
  return { type: "no-answer", reason: `refusal:${reason}` };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((v): v is string => typeof v === "string" && v.length > 0);
}

function toAnswer(raw: unknown, question: Question): Answer {
  if (typeof raw !== "object" || raw === null) {
    throw new DecisionProviderError(
      "malformed_response",
      "openai-decisions: answer is not an object",
    );
  }
  const a = raw as Record<string, unknown>;

  // Per-answer refusal → explicit non-answer.
  const refusal = firstString(a.refusal);
  if (refusal) return refusalAnswer(refusal);

  if (question.type === "noul") {
    const value = a.predicate ?? a.answer ?? a.value ?? a.probability;
    if (typeof value === "boolean") {
      return { type: "noul", noul: value ? 1 : 0 };
    }
    if (isFiniteNumber(value)) {
      return { type: "noul", noul: Math.min(1, Math.max(0, value)) };
    }
    throw new DecisionProviderError(
      "malformed_response",
      "openai-decisions: malformed predicate answer",
    );
  }

  if (question.type === "choice") {
    const choice = firstString(a.choice, a.answer, a.value);
    if (!choice) {
      throw new DecisionProviderError(
        "malformed_response",
        "openai-decisions: malformed choice answer",
      );
    }
    if (!(choice in question.criteria)) {
      throw new DecisionProviderError(
        "malformed_response",
        "openai-decisions: choice not in criteria",
      );
    }
    return {
      type: "choice",
      choice,
      confidence: isFiniteNumber(a.confidence) ? a.confidence : undefined,
    };
  }

  // score — accept a numeric score or a level index.
  const score = a.score ?? a.value ?? a.answer;
  if (isFiniteNumber(score)) {
    return { type: "score", score };
  }
  if (isFiniteNumber(a.level)) {
    return { type: "score", score: a.level };
  }
  throw new DecisionProviderError(
    "malformed_response",
    "openai-decisions: malformed score answer",
  );
}

function indexByName(answers: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(answers)) return map;
  for (const item of answers) {
    if (typeof item === "object" && item !== null) {
      const name = (item as Record<string, unknown>).name;
      if (typeof name === "string") map.set(name, item);
    }
  }
  return map;
}

export function createOpenAiDecisionsProvider(
  options: OpenAiDecisionsProviderOptions,
): DecisionProvider {
  const baseUrl = (
    options.baseUrl ?? OPENAI_DECISIONS_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/decisions`;
  const model = options.model ?? OPENAI_DECISIONS_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchFn ?? fetch;

  async function decide<T extends QuestionPack>(
    state: State,
    questions: T,
    opts?: DecideOptions,
  ): Promise<AnswerMap<T>> {
    if (!options.apiKey) {
      throw new DecisionProviderError(
        "not_configured",
        "openai-decisions: missing api key",
      );
    }

    const wireQuestions: WireQuestion[] = Object.entries(questions).map(
      ([id, question]) => toWireQuestion(id, question),
    );

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
          input: state,
          questions: wireQuestions,
        }),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new DecisionProviderError(
        timedOut ? "timeout" : "http_error",
        `openai-decisions: request failed (${timedOut ? "timeout" : "network"})`,
      );
    }

    if (!res.ok) {
      throw new DecisionProviderError(
        "http_error",
        `openai-decisions: request failed: ${res.status}`,
        res.status,
      );
    }

    let json: OpenAiResponseBody;
    try {
      json = (await res.json()) as OpenAiResponseBody;
    } catch {
      throw new DecisionProviderError(
        "malformed_response",
        "openai-decisions: response is not valid JSON",
      );
    }

    const out: Record<string, Answer> = {};

    // Top-level refusal → every question becomes a non-answer.
    const topRefusal = firstString(json.refusal);
    if (topRefusal) {
      for (const id of Object.keys(questions)) {
        out[id] = refusalAnswer(topRefusal);
      }
      return out as AnswerMap<T>;
    }

    const byName = indexByName(json.answers);
    for (const id of Object.keys(questions)) {
      const raw = byName.get(id);
      if (raw === undefined) {
        throw new DecisionProviderError(
          "missing_answer",
          `openai-decisions: no answer for "${id}"`,
        );
      }
      out[id] = toAnswer(raw, questions[id]);
    }
    return out as AnswerMap<T>;
  }

  return { name: "openai-decisions", decide };
}
