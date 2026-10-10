import { withCircuitBreaker } from "@/lib/infra/circuit-breaker";
import {
  createJevProvider,
  JEV_DEFAULT_BASE_URL,
  JEV_DEFAULT_MODEL,
} from "./jev";
import {
  createOpenAiDecisionsProvider,
  OPENAI_DECISIONS_DEFAULT_BASE_URL,
  OPENAI_DECISIONS_DEFAULT_MODEL,
} from "./openai-decisions";
import { createRulesProvider } from "./rules";
import type { DecisionProvider } from "./types";

// ─── Decision-provider resolution ────────────────────────────────────────────
//
// Precedence: explicit config → env → rules fallback (rules never touch the
// network). A network provider with no resolvable key is treated as
// unconfigured and degrades to rules. Every network call runs behind the
// shared circuit breaker; ANY thrown anomaly (timeout, 5xx, malformed body,
// open breaker) falls straight through to the rules provider — a decision
// must never block the caller on a provider outage.

export type DecisionProviderName = "jev" | "openai-decisions" | "rules";

const BREAKER_OPTS = { threshold: 3, resetMs: 60_000 } as const;

export interface ResolveProviderOptions {
  /** Explicit provider name (highest precedence). */
  provider?: string | null;
  apiKey?: string | null;
  model?: string | null;
  baseUrl?: string | null;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable for tests; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Wrap network calls in the circuit breaker (default true). */
  breaker?: boolean;
}

function envOf(options: ResolveProviderOptions): Record<string, string | undefined> {
  return options.env ?? process.env;
}

function coerceName(raw: string | null | undefined): DecisionProviderName | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "jev") return "jev";
  if (value === "openai" || value === "openai-decisions") {
    return "openai-decisions";
  }
  if (value === "rules" || value === "none") return "rules";
  return null;
}

function resolveName(
  options: ResolveProviderOptions,
  env: Record<string, string | undefined>,
): DecisionProviderName {
  return (
    coerceName(options.provider) ??
    coerceName(env.DECISION_PROVIDER) ??
    coerceName(env.DECISION_ENGINE) ??
    "rules"
  );
}

function resolveKey(
  options: ResolveProviderOptions,
  env: Record<string, string | undefined>,
  name: DecisionProviderName,
): string {
  const explicit = options.apiKey?.trim();
  if (explicit) return explicit;
  if (name === "jev") {
    return (env.TYPESAFE_API_KEY ?? env.JEV_API_KEY ?? "").trim();
  }
  if (name === "openai-decisions") {
    return (env.OPENAI_API_KEY ?? "").trim();
  }
  return "";
}

function buildPrimary(
  name: DecisionProviderName,
  options: ResolveProviderOptions,
  env: Record<string, string | undefined>,
): DecisionProvider | null {
  const apiKey = resolveKey(options, env, name);
  if (name === "rules" || !apiKey) return null;

  const model = options.model?.trim() || undefined;
  const baseUrl = options.baseUrl?.trim() || undefined;

  if (name === "jev") {
    return createJevProvider({
      apiKey,
      model: model || env.JEV_MODEL || JEV_DEFAULT_MODEL,
      baseUrl: baseUrl || env.JEV_BASE_URL || JEV_DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs,
      fetchFn: options.fetchFn,
    });
  }

  return createOpenAiDecisionsProvider({
    apiKey,
    model: model || env.OPENAI_DECISIONS_MODEL || OPENAI_DECISIONS_DEFAULT_MODEL,
    baseUrl:
      baseUrl || env.OPENAI_DECISIONS_BASE_URL || OPENAI_DECISIONS_DEFAULT_BASE_URL,
    timeoutMs: options.timeoutMs,
    fetchFn: options.fetchFn,
  });
}

function withRulesFallback(
  primary: DecisionProvider,
  rules: DecisionProvider,
  breaker: boolean,
): DecisionProvider {
  return {
    name: primary.name,
    async decide(state, questions, opts) {
      try {
        if (!breaker) return await primary.decide(state, questions, opts);
        return await withCircuitBreaker(
          `decision-provider:${primary.name}`,
          () => primary.decide(state, questions, opts),
          BREAKER_OPTS,
        );
      } catch {
        return rules.decide(state, questions, opts);
      }
    },
  };
}

/**
 * Resolve a decision provider from explicit config → env → rules. Pure and
 * synchronous (env is injectable), so it is safe to call per request.
 */
export function resolveDecisionProvider(
  options: ResolveProviderOptions = {},
): DecisionProvider {
  const env = envOf(options);
  const name = resolveName(options, env);
  const rules = createRulesProvider();
  const primary = buildPrimary(name, options, env);
  if (!primary) return rules;
  return withRulesFallback(primary, rules, options.breaker ?? true);
}

/** Convenience wrapper around the process env for the dev harness. */
export function getDecisionProvider(): DecisionProvider {
  return resolveDecisionProvider({ env: process.env });
}
