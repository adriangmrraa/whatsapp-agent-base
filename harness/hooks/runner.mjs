// ─── JEV hooks — generic pack runner ─────────────────────────────────────────
//
// The single entry point every lifecycle hook uses to run a JEV pack. It wires
// the SAME provider + pack catalog the MCP server uses (harness/mcp/*.mjs), so
// the hooks and the MCP tools can never drift: one config, one provider, one
// policy engine.
//
//   runPack("guard", state)  → { ok, pack, provider, engine, decision, answers }
//
// Never throws: a provider outage becomes `{ ok: false, error }` so a hook can
// choose its own fail posture. `decision.allow` / `decision.action` are the
// fields to act on. Node built-ins only.

import { loadConfig, createProvider, ProviderError } from "../mcp/provider.mjs";
import { PACKS, PACKS_BY_TOOL, applyPolicy, packQuestions, toolName } from "../mcp/packs.mjs";

export { loadConfig, createProvider, ProviderError, PACKS, toolName };

/** Reverse of `toolName`: `jev_file_scope` → `file-scope`. */
export function packIdFromTool(tool) {
  return String(tool).replace(/^jev_/, "").replace(/_/g, "-");
}

/**
 * Run one named pack against `state`.
 *
 * @param {string} packId           e.g. "guard" | "verify" | "triage"
 * @param {string|object|array} state  the decision context (no secrets/PII)
 * @param {object} [opts]
 * @param {string[]} [opts.options] candidate ids for a choice-based pack
 * @param {string} [opts.model]     per-call model override
 * @param {number} [opts.timeoutMs] per-call timeout override
 * @param {object} [opts.config]    pre-loaded config (else loadConfig)
 * @param {object} [opts.provider]  pre-built provider (else createProvider)
 * @param {Function} [opts.fetchFn] injectable fetch (tests)
 */
export async function runPack(packId, state, opts = {}) {
  const config = opts.config ?? loadConfig(opts.env);
  const provider = opts.provider ?? createProvider(config, opts.fetchFn);
  const pack = opts.pack ?? PACKS_BY_TOOL[toolName(packId)];

  if (!pack) {
    return {
      ok: false,
      pack: packId,
      provider: provider.name,
      engine: config.engine,
      error: { code: "unknown_pack", message: `unknown pack: ${packId}` },
    };
  }

  let answers;
  try {
    const questions = packQuestions(pack, opts.options);
    answers = await provider.decide(state, questions, {
      model: opts.model,
      timeoutMs: opts.timeoutMs,
    });
  } catch (error) {
    // A provider outage must NOT skip the CODE layer: `applyPolicy` still runs
    // (with an empty answer map) so guard's hard rules are enforced even when
    // there is no model. The decision carries the pack's fail posture.
    const decision = applyPolicy(pack, {}, { state });
    const code = error instanceof ProviderError ? error.code : "internal_error";
    return {
      ok: false,
      pack: pack.id,
      provider: provider.name,
      engine: config.engine,
      decision,
      error: { code, message: String(error?.message ?? error) },
    };
  }

  const decision = applyPolicy(pack, answers, { state });
  return {
    ok: true,
    pack: pack.id,
    provider: provider.name,
    engine: config.engine,
    decision,
    answers,
  };
}
