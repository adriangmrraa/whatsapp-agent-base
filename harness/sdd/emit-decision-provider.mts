#!/usr/bin/env node
// ─── emit-decision-provider ──────────────────────────────────────────────────
//
// Print the `## Decision Provider` block for the orchestrator to inject into a
// delegated SDD sub-agent, right next to `## Project Standards (auto-resolved)`.
//
//   npx tsx harness/sdd/emit-decision-provider.mts
//
// Opt-in: with JEV_HARNESS_SDD unset the block is empty and nothing is printed
// to stdout (a note goes to stderr). The block renders the KEY PRESENCE only —
// never the value.
//
// Usage in an orchestrator (opencode shell / OpenSpec orchestrator):
//   block="$(npx tsx harness/sdd/emit-decision-provider.mts)"
//   # prepend $block to each sub-agent's launch prompt when non-empty

import {
  renderDecisionProviderBlock,
  SDD_HARNESS_FLAG,
} from "../../src/lib/system-one/harness";

const block = renderDecisionProviderBlock(process.env);

if (block) {
  process.stdout.write(block);
} else {
  process.stderr.write(
    `[decision-provider] disabled (set ${SDD_HARNESS_FLAG}=1 to enable)\n`,
  );
}
