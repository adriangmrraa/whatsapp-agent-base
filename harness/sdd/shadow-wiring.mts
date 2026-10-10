#!/usr/bin/env node
// ─── shadow-wiring example (SDD integration, plan §5 + §7) ───────────────────
//
// Runs the SDD phase's JEV packs in SHADOW mode: every provider call is measured
// and the pack decision is persisted to memory (Engram by default) under
// `sdd/<change>/decisions/<phase>`. Nothing acts on the decision — this is the
// "run + log, change nothing" adoption step.
//
// Opt-in. With JEV_HARNESS_SDD unset this CLI no-ops and exits 0.
//
//   JEV_HARNESS_SDD=1 npx tsx harness/sdd/shadow-wiring.mts \
//     --change jev-harness-sdd-integration --phase explore \
//     --task "wire packs into sdd-explore" \
//     --candidates src/lib/a.ts,src/lib/b.ts
//
// Env (see harness/config.example.json / .env.example):
//   DECISION_ENGINE=jev|openai-decisions|rules   (default: rules when no key)
//   JEV_API_KEY / TYPESAFE_API_KEY / OPENAI_API_KEY
//   JEV_MEMORY=engram|neon|none, JEV_MEMORY_PROJECT, ENGRAM_HTTP_URL
//
// Non-invasive: writes only to memory. Never mutates the repo, never calls a
// mutation, never logs the API key (the provider already redacts state).

import { isEnabled, createShadowRunner } from "../../src/lib/system-one/harness";
import { createContextPrimer } from "../../src/lib/system-one/context/primer";
import { getMemoryProvider } from "../../src/lib/system-one/context/memory/registry";
import { resolveDecisionProvider } from "../../src/lib/system-one/provider/registry";
import type { PackCandidate } from "../../src/lib/system-one/packs/types";

/** Which packs each SDD phase consults (plan §5). */
const PHASE_PACKS: Readonly<Record<string, readonly string[]>> = {
  orchestrator: ["skill-route", "context-prime"],
  explore: ["file-scope", "ambiguity"],
  design: ["file-scope", "blast-radius"],
  tasks: ["workload-forecast"],
  apply: ["guard", "scope-guard", "test-impact"],
  verify: ["acceptance", "verify", "triage"],
};

const USAGE = [
  "Usage: JEV_HARNESS_SDD=1 npx tsx harness/sdd/shadow-wiring.mts --change <name> --phase <phase> [--task <text>] [--candidates a,b,c]",
  "",
  `phases: ${Object.keys(PHASE_PACKS).join(" | ")}`,
].join("\n");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function candidatesFrom(raw: string | undefined): PackCandidate[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((id) => ({ id }));
}

async function main(): Promise<void> {
  if (!isEnabled(process.env)) {
    process.stderr.write(
      "[shadow-wiring] disabled (set JEV_HARNESS_SDD=1 to enable)\n",
    );
    return;
  }

  const change = arg("change");
  const phase = arg("phase");
  if (!change || !phase) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  const packs = PHASE_PACKS[phase];
  if (!packs) {
    process.stderr.write(`[shadow-wiring] unknown phase "${phase}"\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  const task = arg("task") ?? change;
  const project = process.env.JEV_MEMORY_PROJECT || undefined;
  const candidates = candidatesFrom(arg("candidates"));

  const provider = resolveDecisionProvider({ env: process.env });
  const memory = getMemoryProvider({ project });
  const primer = createContextPrimer(memory);
  const runner = createShadowRunner({ provider, primer, memory, project });

  process.stdout.write(
    `[shadow-wiring] change=${change} phase=${phase} engine=${provider.name} memory=${memory.name}\n`,
  );

  for (const packId of packs) {
    const run = await runner.run(
      packId,
      { task, candidates, project },
      { change, phase },
    );
    process.stdout.write(
      `  pack=${packId} posture=${run.payload.posture} degraded=${run.payload.degraded} ` +
        `allow=${run.payload.allow} reason=${run.payload.reason} ` +
        `persisted=${run.persistedId ?? "none"} (shadow, acted=false)\n`,
    );
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
