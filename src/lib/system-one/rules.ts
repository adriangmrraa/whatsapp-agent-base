import type {
  DecisionLayer,
  SystemOneDecision,
  SystemOneInput,
} from "./types";

// ─── Rule-based decision layer ("Jev" default) ───────────────────────────────
//
// Pure keyword/heuristic classification — no network, no model. This is the
// deterministic core the LLM flow consults first. A hosted Jev/Laya provider
// can replace it behind the same DecisionLayer interface without touching the
// agents.

const HANDOFF = /hablar con (un )?humano|una persona|un agente|operador|representante|asesor/i;
const COMMERCIAL =
  /precio|cuánto|cuanto sale|menú|menu|producto|catálogo|catalogo|combo|promo|oferta|pedido|orden|comprar|llevar|delivery|envío|envio/i;
const SUPPORT = /reclamo|problema|queja|no llegó|no llego|error|falla|tarde|frío|frio/i;

function classify(text: string): { choice: string; reason: string } {
  const lower = text.toLowerCase().trim();
  if (HANDOFF.test(lower)) return { choice: "handoff", reason: "handoff_keywords" };
  if (SUPPORT.test(lower)) return { choice: "support", reason: "support_keywords" };
  if (COMMERCIAL.test(lower)) return { choice: "commercial", reason: "commercial_keywords" };
  return { choice: "other", reason: "no_rule_matched" };
}

export const ruleBasedDecisionLayer: DecisionLayer = {
  name: "jev",
  async decide(input: SystemOneInput): Promise<SystemOneDecision> {
    const { choice, reason } = classify(input.text);

    if (choice === "handoff") {
      return {
        kind: "gate",
        label: "intent",
        choice,
        allow: false,
        reason,
        provider: "jev",
      };
    }

    return {
      kind: "choice",
      label: "intent",
      choice,
      allow: true,
      reason,
      provider: "jev",
    };
  },
};
