import { withCircuitBreaker } from "@/lib/infra/circuit-breaker";
import { getDecisionConfig, isDecisionConfigured } from "./config";
import { createHostedDecisionLayer } from "./hosted";
import { ruleBasedDecisionLayer } from "./rules";
import type { DecisionLayer } from "./types";

// ─── Per-tenant decision-layer resolution ────────────────────────────────────
//
// Unconfigured tenants get the local rules layer for free — zero egress. A
// configured tenant gets a chain: the hosted Jev/Laya API behind a per-process
// circuit breaker keyed by baseUrl (3 consecutive-ish failures → open for
// 60s → hosted skipped entirely), and ANY hosted failure — timeout, 5xx,
// malformed payload, open breaker — falls straight through to rules.

const BREAKER_OPTS = { threshold: 3, resetMs: 60_000 } as const;

function chainWithRules(hosted: DecisionLayer, breakerKey: string): DecisionLayer {
  async function decideSet(input: Parameters<DecisionLayer["decideSet"]>[0]) {
    try {
      return await withCircuitBreaker(
        breakerKey,
        () => hosted.decideSet(input),
        BREAKER_OPTS,
      );
    } catch {
      return ruleBasedDecisionLayer.decideSet(input);
    }
  }

  return {
    name: `${hosted.name}+${ruleBasedDecisionLayer.name}`,
    decide: async (input) => (await decideSet(input))[0],
    decideSet,
  };
}

export async function getDecisionLayer(
  tenantId: number,
): Promise<DecisionLayer> {
  try {
    if (!(await isDecisionConfigured(tenantId))) {
      return ruleBasedDecisionLayer;
    }
    const cfg = await getDecisionConfig(tenantId);
    const hosted = createHostedDecisionLayer({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      engine: cfg.engine,
      timeoutMs: cfg.timeoutMs,
    });
    return chainWithRules(hosted, `decision:${cfg.baseUrl}`);
  } catch {
    // Config resolution must never block a turn — degrade to rules.
    return ruleBasedDecisionLayer;
  }
}
