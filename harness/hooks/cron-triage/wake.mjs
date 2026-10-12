#!/usr/bin/env node
// ─── JEV hooks — cron-triage: should we wake an agent? ───────────────────────
//
// The trigger is EXTERNAL and CONFIGURABLE (an interval cron, or an event
// webhook). This script answers the one question a trigger must not guess:
// *is there something a human/agent must act on right now?* It reuses the
// EXISTING `triage` pack (via ../runner.mjs) — the same provider + packs as the
// MCP server.
//
//   blocking (a real regression)  → WAKE the agent
//   rerunable / flake / env       → SLEEP (let the interval retry)
//   unknown                       → SLEEP (never wake on an unclassified signal)
//
// There is deliberately NO hardcoded interval (no "every 15 minutes"): the
// cadence is a deployment policy, passed in by the caller. See README.md.

import { spawnSync } from "node:child_process";
import { runPack } from "../runner.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    process.stdin.resume();
  });
}

function parseArgs(argv) {
  const out = { state: undefined, event: undefined, trigger: "interval", raw: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") out.state = argv[++i];
    else if (arg === "--event") {
      out.event = argv[++i];
      out.trigger = "event";
    } else if (arg === "--interval") out.trigger = "interval";
    else if (arg === "--raw") out.raw = true;
  }
  return out;
}

/** Map a triage decision to a wake/sleep verdict (code, deterministic). */
export function decideWake(decision) {
  const blocking = Boolean(decision?.value?.blocking);
  const rerun = Boolean(decision?.value?.rerun);
  const cause = decision?.value?.cause ?? "unknown";
  if (blocking) return { wake: true, cause, reason: `blocking ${cause}` };
  if (rerun) return { wake: false, cause, reason: `rerunable ${cause}` };
  return { wake: false, cause, reason: `no actionable signal (${cause})` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stdin = (await readStdin()).trim();

  let stateText = args.state ?? stdin ?? "";
  if (args.event) {
    let event = args.event;
    try {
      event = JSON.parse(args.event);
    } catch {
      /* keep the raw string */
    }
    stateText = `event ${JSON.stringify(event)}\n${stateText}`.trim();
  }
  if (!stateText) {
    stateText = "no pending event payload provided";
  }

  const result = await runPack("triage", {
    task: stateText,
    trigger: args.trigger,
    intervalMs: Number(process.env.JEV_TRIAGE_INTERVAL_MS || 0) || undefined,
  });

  // Offline / no provider: never wake on a guess — only an explicit blocking
  // signal (which needs a provider) can wake. Default to SLEEP.
  const decide = result.ok
    ? decideWake(result.decision)
    : { wake: false, cause: "unavailable", reason: `triage unavailable (${result.error?.code ?? "error"})` };

  if (decide.wake && process.env.JEV_WAKE_CMD) {
    // Fire-and-forget the wake command; the caller owns its side effects.
    try {
      spawnSync(process.env.JEV_WAKE_CMD, { shell: true, stdio: "inherit" });
    } catch (error) {
      decide.reason += `; wake command failed: ${String(error?.message ?? error)}`;
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        wake: decide.wake,
        cause: decide.cause,
        reason: decide.reason,
        trigger: args.trigger,
        provider: result.provider,
        engine: result.engine,
        decision: result.ok ? result.decision : undefined,
        error: result.ok ? undefined : result.error,
      },
      null,
      2,
    )}\n`,
  );
  // Exit 0 either way: "wake" is data, not an error. A caller can branch on it.
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({ wake: false, reason: `internal error: ${String(error?.message ?? error)}` })}\n`,
  );
});
