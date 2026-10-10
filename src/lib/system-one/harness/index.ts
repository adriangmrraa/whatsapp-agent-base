// ─── JEV harness — SDD integration surface (Phase 5) ─────────────────────────
//
// Pure, opt-in helpers the SDD orchestrator and phases use:
//   - decision-provider: render the `## Decision Provider` block from env
//     (base URL + key PRESENCE; never the value).
//   - shadow-runner: run a named pack in shadow (measure + log + persist to
//     `sdd/<change>/decisions/<phase>`), acting on nothing.
//
// Both are pure over injected inputs; the CLIs in `harness/sdd/` wire the real
// provider, memory and primer.

export {
  SDD_HARNESS_FLAG,
  SDD_PACK_IDS,
  buildDecisionProviderBlock,
  isEnabled,
  renderDecisionProviderBlock,
  resolveDecisionProviderInfo,
} from "./decision-provider";
export type {
  DecisionEngineName,
  DecisionProviderInfo,
  EnvMap,
} from "./decision-provider";

export { createShadowRunner, decisionTopicKey } from "./shadow-runner";
export type {
  ShadowDecisionPayload,
  ShadowPackRun,
  ShadowRunContext,
  ShadowRunner,
  ShadowRunnerDeps,
} from "./shadow-runner";
