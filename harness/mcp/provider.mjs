// ─── JEV harness MCP — provider transport ────────────────────────────────────
//
// Dependency-light (Node built-ins + global fetch only). Mirrors the in-repo
// TypeScript contract at src/lib/system-one/provider/*: a provider takes a
// `state` plus a typed `questions` pack and returns a typed answers map.
//
// Engines (config `provider.engine` or env `DECISION_ENGINE`):
//   jev               POST {baseUrl}/v1/systemone   (JEV_API_KEY | TYPESAFE_API_KEY)
//   openai-decisions  POST {baseUrl}/v1/decisions   (OPENAI_API_KEY)   [2nd provider]
//   rules             deterministic fallback, no network — always "no-answer"
//
// Rules: zero retries (the caller owns resilience); throw ProviderError on ANY
// anomaly (that throw is the fallback trigger); never log request/response
// bodies or secrets.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const JEV_DEFAULT_MODEL = "jev-latest";
export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
export const OPENAI_DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_TIMEOUT_MS = 8000;

export class ProviderError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const NO_ANSWER = (reason) => ({ type: "no-answer", reason });

function firstExisting(paths) {
  for (const p of paths) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Resolve the config file path: env `JEV_HARNESS_CONFIG`, else harness/config.json. */
function resolveConfigPath(env) {
  const fromEnv = env.JEV_HARNESS_CONFIG;
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  return firstExisting([
    join(process.cwd(), "harness", "config.json"),
    join(HERE, "..", "config.json"),
  ]);
}

/**
 * Load merged config: defaults ← harness/config.json ← process env.
 * Returns `{ engine, model, baseUrl, timeoutMs, apiKey, memory, packs }`.
 * Never throws: a missing/invalid file degrades to env-only defaults.
 */
export function loadConfig(env = process.env) {
  let file = {};
  const configPath = resolveConfigPath(env);
  if (configPath) {
    try {
      file = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      file = {};
    }
  }

  const provider = file.provider ?? {};
  const engine = (provider.engine ?? env.DECISION_ENGINE ?? "jev").toLowerCase();
  const apiKeyEnv = provider.apiKeyEnv ?? "JEV_API_KEY";

  const apiKeyFor = (name) => (env[name] ?? "").trim();
  let apiKey = "";
  if (engine === "openai-decisions") {
    apiKey = apiKeyFor("OPENAI_API_KEY") || apiKeyFor("DECISION_API_KEY") || apiKeyFor(apiKeyEnv);
  } else {
    apiKey =
      apiKeyFor(apiKeyEnv) || apiKeyFor("JEV_API_KEY") || apiKeyFor("TYPESAFE_API_KEY");
  }

  const defaultBaseUrl =
    engine === "openai-decisions" ? OPENAI_DEFAULT_BASE_URL : JEV_DEFAULT_BASE_URL;
  const defaultModel =
    engine === "openai-decisions" ? OPENAI_DEFAULT_MODEL : JEV_DEFAULT_MODEL;

  return {
    engine,
    model: provider.model ?? env.DECISION_MODEL ?? defaultModel,
    baseUrl: String(provider.baseUrl ?? env.DECISION_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, ""),
    timeoutMs: Number.parseInt(provider.timeoutMs ?? env.DECISION_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS,
    apiKey,
    memory: {
      backend: (file.memory?.backend ?? env.JEV_MEMORY ?? "engram").toLowerCase(),
      project: file.memory?.project ?? env.JEV_MEMORY_PROJECT ?? "",
    },
    /** Per-pack enable flags / threshold overrides from `packs` in the file. */
    packs: file.packs ?? {},
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function asProbabilities(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(value)) if (isFiniteNumber(v)) out[k] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Jev ──────────────────────────────────────────────────────────────────────

function createJevProvider(config, fetchFn) {
  const endpoint = `${config.baseUrl}/v1/systemone`;

  async function decide(state, questions, opts = {}) {
    if (!config.apiKey) throw new ProviderError("not_configured", "jev: missing api key");

    const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
    let res;
    try {
      res = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model: opts.model ?? config.model, state, questions }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new ProviderError(timedOut ? "timeout" : "http_error", `jev: request failed (${timedOut ? "timeout" : "network"})`);
    }

    if (!res.ok) throw new ProviderError("http_error", `jev: request failed: ${res.status}`, res.status);

    let json;
    try {
      json = await res.json();
    } catch {
      throw new ProviderError("malformed_response", "jev: response is not valid JSON");
    }
    if (typeof json.answers !== "object" || json.answers === null) {
      throw new ProviderError("malformed_response", "jev: response is missing answers");
    }

    const out = {};
    for (const id of Object.keys(questions)) {
      const raw = json.answers[id];
      if (raw === undefined) throw new ProviderError("missing_answer", `jev: no answer for "${id}"`);
      out[id] = normalizeJevAnswer(raw, questions[id], id);
    }
    return out;
  }

  return { name: "jev", decide };
}

function normalizeJevAnswer(raw, question, id) {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderError("malformed_response", `jev: answer "${id}" is not an object`);
  }
  if (question.type === "noul") {
    if (raw.type !== "noul" || !isFiniteNumber(raw.noul) || raw.noul < 0 || raw.noul > 1) {
      throw new ProviderError("malformed_response", `jev: malformed noul answer "${id}"`);
    }
    return { type: "noul", noul: raw.noul };
  }
  if (question.type === "choice") {
    if (raw.type !== "choice" || typeof raw.choice !== "string" || raw.choice.length === 0) {
      throw new ProviderError("malformed_response", `jev: malformed choice answer "${id}"`);
    }
    if (!(raw.choice in question.criteria)) {
      throw new ProviderError("malformed_response", `jev: choice "${raw.choice}" not in criteria for "${id}"`);
    }
    return {
      type: "choice",
      choice: raw.choice,
      confidence: isFiniteNumber(raw.confidence) ? raw.confidence : undefined,
      probabilities: asProbabilities(raw.probabilities),
    };
  }
  if (raw.type !== "score" || !isFiniteNumber(raw.score)) {
    throw new ProviderError("malformed_response", `jev: malformed score answer "${id}"`);
  }
  return {
    type: "score",
    score: raw.score,
    confidence: isFiniteNumber(raw.confidence) ? raw.confidence : undefined,
    probabilities: asProbabilities(raw.probabilities),
    legend: asProbabilities(raw.legend),
  };
}

// ── OpenAI Decisions (second provider) ───────────────────────────────────────
//
// Public-beta contract (plan §1.2). Field mapping below is best-effort and
// defensive: verify against current docs before trusting it. A `refusal`
// becomes an explicit no-answer so policy can fail closed.

function toOpenAiQuestion(id, question) {
  if (question.type === "noul") {
    return { type: "predicate", name: id, instructions: question.instructions };
  }
  if (question.type === "choice") {
    return { type: "choice", name: id, instructions: question.instructions, choices: Object.keys(question.criteria) };
  }
  return { type: "score", name: id, instructions: question.instructions, levels: question.criteria };
}

function fromOpenAiAnswer(raw, question, id) {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderError("malformed_response", `openai-decisions: answer "${id}" is not an object`);
  }
  if (raw.refusal) return NO_ANSWER("openai_decisions_refusal");
  if (question.type === "noul") {
    if (isFiniteNumber(raw.probability ?? raw.predication)) {
      return { type: "noul", noul: raw.probability ?? raw.predication };
    }
    if (typeof (raw.prediction ?? raw.predicate) === "boolean") {
      return { type: "noul", noul: (raw.prediction ?? raw.predicate) ? 1 : 0 };
    }
    throw new ProviderError("malformed_response", `openai-decisions: malformed predicate "${id}"`);
  }
  if (question.type === "choice") {
    if (typeof raw.choice !== "string" || raw.choice.length === 0) {
      throw new ProviderError("malformed_response", `openai-decisions: malformed choice "${id}"`);
    }
    return { type: "choice", choice: raw.choice, confidence: isFiniteNumber(raw.confidence) ? raw.confidence : undefined };
  }
  if (!isFiniteNumber(raw.score)) {
    throw new ProviderError("malformed_response", `openai-decisions: malformed score "${id}"`);
  }
  return { type: "score", score: raw.score, confidence: isFiniteNumber(raw.confidence) ? raw.confidence : undefined };
}

function createOpenAiProvider(config, fetchFn) {
  const endpoint = `${config.baseUrl}/v1/decisions`;

  async function decide(state, questions, opts = {}) {
    if (!config.apiKey) throw new ProviderError("not_configured", "openai-decisions: missing api key");

    const list = Object.entries(questions).map(([id, q]) => toOpenAiQuestion(id, q));
    const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
    let res;
    try {
      res = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model: opts.model ?? config.model, input: state, questions: list }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new ProviderError(timedOut ? "timeout" : "http_error", `openai-decisions: request failed (${timedOut ? "timeout" : "network"})`);
    }
    if (!res.ok) throw new ProviderError("http_error", `openai-decisions: request failed: ${res.status}`, res.status);

    let json;
    try {
      json = await res.json();
    } catch {
      throw new ProviderError("malformed_response", "openai-decisions: response is not valid JSON");
    }
    const arr = Array.isArray(json.answers) ? json.answers : [];
    const byName = new Map(arr.map((a) => [a?.name, a]));
    const out = {};
    for (const [id, question] of Object.entries(questions)) {
      const raw = byName.get(id);
      if (!raw) throw new ProviderError("missing_answer", `openai-decisions: no answer for "${id}"`);
      out[id] = fromOpenAiAnswer(raw, question, id);
    }
    return out;
  }

  return { name: "openai-decisions", decide };
}

// ── rules (deterministic, no network) ────────────────────────────────────────

function createRulesProvider() {
  return {
    name: "rules",
    async decide(state, questions) {
      const out = {};
      for (const id of Object.keys(questions)) out[id] = NO_ANSWER("rules_fallback");
      return out;
    },
  };
}

/** Build the active provider from config. `fetchFn` is injectable for tests. */
export function createProvider(config, fetchFn = globalThis.fetch) {
  if (config.engine === "openai-decisions") return createOpenAiProvider(config, fetchFn);
  if (config.engine === "rules") return createRulesProvider();
  return createJevProvider(config, fetchFn);
}
