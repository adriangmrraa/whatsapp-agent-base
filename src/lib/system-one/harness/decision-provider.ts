// ─── Decision Provider block (SDD integration, plan §5) ──────────────────────
//
// The orchestrator injects a `## Decision Provider` block into every delegated
// SDD sub-agent, right next to the existing `## Project Standards
// (auto-resolved)` block (see `_shared/skill-resolver.md` Step 3). The block
// tells the sub-agent that the JEV decision layer is available in SHADOW mode,
// where it lives, and how to persist each decision.
//
// Two hard rules, both structural:
//   1. OPT-IN. Nothing is emitted unless `JEV_HARNESS_SDD` is truthy, so a repo
//      that does not want the harness sees an unchanged prompt.
//   2. NO SECRETS. The block renders the PRESENCE of the API key (`present` /
//      `absent`) and the env var NAME only — never the value. The key never
//      leaves the process through this path (plan §2.3 / AGENTS.md rule 3).
//
// Pure: reads an injected env map, returns a string. No I/O, no network, no
// mutation — so it is trivially testable and safe to call per delegation.

export type DecisionEngineName = "jev" | "openai-decisions" | "rules";

/** Everything the block needs, resolved from env — no secret values. */
export interface DecisionProviderInfo {
  /** True only when `JEV_HARNESS_SDD` is truthy. */
  enabled: boolean;
  engine: DecisionEngineName;
  /** Provider base URL (empty for the offline `rules` engine). */
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Whether the active engine's API key is present in the env. */
  keyPresent: boolean;
  /** The env var the key is expected in — the NAME, never the value. */
  keyVar: string;
}

export type EnvMap = Record<string, string | undefined>;

export const SDD_HARNESS_FLAG = "JEV_HARNESS_SDD";

/** Packs the SDD flow consults, in catalog order (plan §5). */
export const SDD_PACK_IDS: readonly string[] = [
  "context-prime",
  "file-scope",
  "skill-route",
  "workload-forecast",
  "ambiguity",
  "scope-guard",
  "test-impact",
  "triage",
  "acceptance",
  "blast-radius",
  "review",
  "verify",
  "guard",
];

const DEFAULT_TIMEOUT_MS = 8_000;
const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
const JEV_DEFAULT_MODEL = "jev-latest";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL = "gpt-6-luna";

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Truthy env flag: 1 | true | yes | on (case-insensitive). */
export function isEnabled(env: EnvMap = process.env): boolean {
  const value = trimmed(env[SDD_HARNESS_FLAG]).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function coerceEngine(raw: string | undefined): DecisionEngineName | null {
  const value = trimmed(raw).toLowerCase();
  if (value === "jev") return "jev";
  if (value === "openai" || value === "openai-decisions") return "openai-decisions";
  if (value === "rules" || value === "none") return "rules";
  return null;
}

function resolveEngine(env: EnvMap): DecisionEngineName {
  return (
    coerceEngine(env.DECISION_PROVIDER) ??
    coerceEngine(env.DECISION_ENGINE) ??
    "jev"
  );
}

/** Which env var holds the key for `engine`, and whether it is present. */
function resolveKey(
  env: EnvMap,
  engine: DecisionEngineName,
): { present: boolean; keyVar: string } {
  if (engine === "rules") return { present: false, keyVar: "" };
  if (engine === "openai-decisions") {
    return {
      present: trimmed(env.OPENAI_API_KEY).length > 0,
      keyVar: "OPENAI_API_KEY",
    };
  }
  const jevKey = trimmed(env.JEV_API_KEY);
  if (jevKey.length > 0) return { present: true, keyVar: "JEV_API_KEY" };
  return {
    present: trimmed(env.TYPESAFE_API_KEY).length > 0,
    keyVar: "TYPESAFE_API_KEY",
  };
}

function resolveBaseUrl(env: EnvMap, engine: DecisionEngineName): string {
  if (engine === "rules") return "";
  if (engine === "openai-decisions") {
    const url =
      trimmed(env.OPENAI_DECISIONS_BASE_URL) || trimmed(env.DECISION_BASE_URL);
    return (url || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  }
  const url = trimmed(env.JEV_BASE_URL) || trimmed(env.DECISION_BASE_URL);
  return (url || JEV_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function resolveModel(env: EnvMap, engine: DecisionEngineName): string {
  if (engine === "openai-decisions") {
    return (
      trimmed(env.OPENAI_DECISIONS_MODEL) ||
      trimmed(env.DECISION_MODEL) ||
      OPENAI_DEFAULT_MODEL
    );
  }
  return trimmed(env.JEV_MODEL) || trimmed(env.DECISION_MODEL) || JEV_DEFAULT_MODEL;
}

function resolveTimeout(env: EnvMap): number {
  const parsed = Number.parseInt(trimmed(env.DECISION_TIMEOUT_MS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Resolve the decision-provider provenance from env. Never reads or returns a
 * secret value — only whether the key is present.
 */
export function resolveDecisionProviderInfo(
  env: EnvMap = process.env,
): DecisionProviderInfo {
  const engine = resolveEngine(env);
  const key = resolveKey(env, engine);
  return {
    enabled: isEnabled(env),
    engine,
    baseUrl: resolveBaseUrl(env, engine),
    model: resolveModel(env, engine),
    timeoutMs: resolveTimeout(env),
    keyPresent: key.present,
    keyVar: key.keyVar,
  };
}

/**
 * Render the `## Decision Provider` block. Returns `""` when the harness is
 * disabled, so callers can concatenate unconditionally.
 */
export function buildDecisionProviderBlock(info: DecisionProviderInfo): string {
  if (!info.enabled) return "";

  const keyLine =
    info.engine === "rules"
      ? "- api_key: n/a — `rules` engine runs offline and emits explicit no-answers"
      : info.keyPresent
        ? `- api_key: present (${info.keyVar}; value is never printed, logged or sent to a sub-agent)`
        : `- api_key: absent (${info.keyVar} not set) — the engine degrades to \`rules\` (offline no-answers)`;

  const lines = [
    "## Decision Provider (auto-resolved)",
    "",
    "A JEV decision layer is available for this change. Consult it in **shadow",
    "mode only**: run the pack, log the decision, and persist it to Engram. Do",
    "NOT let a decision change behavior until the ledger gate promotes the pack",
    "(plan §7). `[closed]` packs (`ambiguity`, `scope-guard`, `guard`) fail closed",
    "only once ACTIVE — in shadow they are advisory.",
    "",
    `- engine: \`${info.engine}\``,
    `- base_url: \`${info.baseUrl || "(none — offline)"}\``,
    `- model: \`${info.model}\``,
    `- timeout_ms: ${info.timeoutMs}`,
    keyLine,
    `- packs: ${SDD_PACK_IDS.map((id) => `\`${id}\``).join(", ")}`,
    "- persist decisions to: `sdd/<change>/decisions/<phase>`",
    "- posture: shadow (advisory); promote per the ledger gate",
  ];
  return `${lines.join("\n")}\n`;
}

/** Convenience: resolve from env and render (empty string when disabled). */
export function renderDecisionProviderBlock(env: EnvMap = process.env): string {
  return buildDecisionProviderBlock(resolveDecisionProviderInfo(env));
}
