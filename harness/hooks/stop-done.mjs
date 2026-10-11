#!/usr/bin/env node
// ─── JEV hooks — Stop DONE (deterministic autonomy) ──────────────────────────
//
// A lifecycle-hook adapter that runs when the agent wants to stop. It combines
// a CODE evidence gate with the EXISTING `verify` pack (via ./runner.mjs, the
// same provider + packs as the MCP server):
//
//   1. CODE: run `checks.sh` (or $JEV_CHECKS_CMD). Its exit code is the
//      non-negotiable floor — a failing evidence command always blocks the stop.
//   2. JEV: ask the `verify` pack whether the evidence covers the goal.
//   3. BANDS (from ./bands.mjs, mirroring policy.ts):
//        score >= 0.9        → STOP
//        0.5 <= score < 0.9  → STOP and write REVIEW.md
//        score < 0.5         → BLOCK and keep going
//   4. TURN-CAP in code: after $JEV_STOP_MAX_TURNS attempts, stop regardless
//      (escaping an unresolvable loop is code's job, not the model's).
//
// Claude Code input (stdin): { hook_event_name:"Stop", stop_hook_active, session_id, cwd, ... }
// Output (stdout): { "decision": "block", "reason": "..." } to keep going; nothing to stop.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runPack } from "./runner.mjs";
import { bandsFor } from "./bands.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHECKS = join(HERE, "checks.sh");
const STOP_STATE_FILE = "stop-attempts.json";

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
  const out = { goal: undefined, checks: undefined, raw: false, review: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--goal") out.goal = argv[++i];
    else if (arg === "--checks") out.checks = argv[++i];
    else if (arg === "--review") out.review = argv[++i];
    else if (arg === "--raw") out.raw = true;
  }
  return out;
}

/** Increment and persist the per-session stop-attempt counter. */
export function bumpAttempts(dir, sessionId) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, STOP_STATE_FILE);
  let map = {};
  try {
    map = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    map = {};
  }
  const key = sessionId || "default";
  const next = (Number(map[key]) || 0) + 1;
  map[key] = next;
  try {
    writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`);
  } catch {
    /* the counter is best-effort; a write failure must not break the hook */
  }
  return next;
}

/** Run the evidence command in code. Never throws; a spawn failure is exit 1. */
export function runChecks(command, cwd) {
  const custom = command ?? process.env.JEV_CHECKS_CMD;
  const result = custom
    ? spawnSync(custom, { cwd, shell: true, encoding: "utf8", timeout: 600000 })
    : spawnSync("bash", [DEFAULT_CHECKS], { cwd, encoding: "utf8", timeout: 600000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(0, 20000);
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return { exitCode, output };
}

/**
 * Pure stop decision — the banding + turn-cap, in code.
 * @returns {{ verdict: "stop"|"review"|"block", score: number, auto: number, flag: number, reason: string }}
 */
export function evaluateStop({ evidenceExitCode, verifyNoul, attempts, maxTurns, bands }) {
  const { auto, flag } = bands;
  const evidenceOk = evidenceExitCode === 0;
  let score;
  if (!evidenceOk) score = 0;
  else if (typeof verifyNoul === "number") score = verifyNoul;
  else score = 1; // advisory verify with no signal: the code evidence suffices

  let verdict;
  if (score >= auto) verdict = "stop";
  else if (score >= flag) verdict = "review";
  else verdict = "block";

  let reason = `evidence score ${score.toFixed(2)} (auto ${auto}, flag ${flag})`;
  // Turn-cap in code wins over everything: escaping an unresolvable loop is
  // code's job. Without it a failing check could block the stop forever.
  if (attempts >= maxTurns) {
    verdict = "stop";
    reason = `turn cap reached (${attempts}/${maxTurns}); stopping`;
  } else if (!evidenceOk) {
    reason = `evidence command failed (exit ${evidenceExitCode}); ${reason}`;
  }
  return { verdict, score, auto, flag, reason };
}

function writeReview(path, { goal, evidence, score, auto, flag, reason }) {
  const body = [
    "# REVIEW — JEV stop check",
    "",
    `- **When**: ${new Date().toISOString()}`,
    `- **Goal**: ${goal}`,
    `- **Evidence command exit**: ${evidence.exitCode}`,
    `- **Verify score**: ${score.toFixed(2)} (auto ${auto}, flag ${flag})`,
    `- **Verdict**: stop-with-review`,
    `- **Reason**: ${reason}`,
    "",
    "## Checks output (truncated)",
    "",
    "```",
    evidence.output.slice(0, 4000),
    "```",
    "",
  ].join("\n");
  try {
    writeFileSync(path, body);
  } catch {
    /* best-effort artifact */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = (await readStdin()).trim();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
  }

  const cwd = payload.cwd || process.cwd();
  const sessionId = payload.session_id || process.env.JEV_SESSION_ID || "default";
  const dir = process.env.JEV_HOOKS_STATE_DIR || join(cwd, ".jev-hooks");
  const attempts = bumpAttempts(dir, sessionId);
  const maxTurns = Number.parseInt(process.env.JEV_STOP_MAX_TURNS || "8", 10);

  const evidence = runChecks(args.checks, cwd);
  const goal = args.goal || process.env.JEV_STOP_GOAL || "the session's stated goal";
  const result = await runPack("verify", {
    goal,
    evidence: { exitCode: evidence.exitCode, output: evidence.output },
  });

  const verifyNoul =
    result.ok && result.answers?.evidence?.type === "noul"
      ? result.answers.evidence.noul
      : undefined;
  const bands = bandsFor("verify");
  const { verdict, score, reason } = evaluateStop({
    evidenceExitCode: evidence.exitCode,
    verifyNoul,
    attempts,
    maxTurns,
    bands,
  });

  const reviewPath =
    args.review || process.env.JEV_STOP_REVIEW_PATH || join(cwd, "REVIEW.md");
  if (verdict === "review") writeReview(reviewPath, { goal, evidence, score, reason, ...bands });

  const isClaudeHook = Boolean(payload.hook_event_name) || payload.stop_hook_active !== undefined;
  if (isClaudeHook && !args.raw) {
    if (verdict === "block") {
      process.stdout.write(
        `${JSON.stringify({ decision: "block", reason: `JEV stop-check: ${reason}` })}\n`,
      );
    }
    // stop / review → allow the stop (no decision output).
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        verdict,
        score,
        attempts,
        maxTurns,
        provider: result.provider,
        engine: result.engine,
        evidenceExitCode: evidence.exitCode,
        review: verdict === "review" ? reviewPath : undefined,
        reason,
        decision: result.ok ? result.decision : undefined,
        error: result.ok ? undefined : result.error,
      },
      null,
      2,
    )}\n`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    // A broken check must never let a session stop unverified: fail closed.
    process.stdout.write(
      `${JSON.stringify({
        decision: "block",
        reason: `JEV stop-check internal error: ${String(error?.message ?? error)}`,
      })}\n`,
    );
  });
}
