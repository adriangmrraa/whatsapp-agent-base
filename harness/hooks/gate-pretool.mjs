#!/usr/bin/env node
// ─── JEV hooks — PreToolUse GATE (deterministic safety) ──────────────────────
//
// A lifecycle-hook adapter that runs the EXISTING `guard` pack before a tool
// executes. It reuses the same provider + packs as the MCP server (via
// ./runner.mjs), so there is a single source of truth for the decision.
//
// The guard pack already runs the hard rules in CODE first (rm -rf /,
// git push --force, pipe to sh/bash) and only then asks the model for the 5-way
// risk category. This hook maps that decision to the host's contract:
//
//   deny  → permissionDecision "deny"   (never run)
//   ask   → permissionDecision "ask"    (human confirms)
//   allow → permissionDecision "allow"
//
// Fail posture: if no provider is configured (engine "rules"), the semantic
// layer has no signal, so the hook degrades to hard-rules-only (the code layer
// still denies) and otherwise allows — blocking every tool offline would make
// the harness unusable. If a configured provider errors, it fails CLOSED (ask).
//
// Claude Code input (stdin):  { hook_event_name:"PreToolUse", tool_name, tool_input, ... }
// Output (stdout):            { hookSpecificOutput: { hookEventName:"PreToolUse",
//                               permissionDecision, permissionDecisionReason } }
//
// Manual use:  node gate-pretool.mjs --tool Bash --state "rm -rf /"

import { pathToFileURL } from "node:url";
import { runPack } from "./runner.mjs";

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
  const out = { tool: undefined, state: undefined, raw: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tool") out.tool = argv[++i];
    else if (arg === "--state") out.state = argv[++i];
    else if (arg === "--raw") out.raw = true;
  }
  return out;
}

/** Best-effort flattening of a tool call into the text the guard screens. */
export function toolActionText(toolName, toolInput) {
  if (toolInput === undefined || toolInput === null) return String(toolName ?? "");
  if (typeof toolInput === "string") return toolInput;
  if (typeof toolInput.command === "string") return toolInput.command;
  if (typeof toolInput.filePath === "string") return `${toolName} ${toolInput.filePath}`;
  if (typeof toolInput.file_path === "string") return `${toolName} ${toolInput.file_path}`;
  if (typeof toolInput.pattern === "string") return `${toolName} ${toolInput.pattern}`;
  try {
    return `${toolName} ${JSON.stringify(toolInput)}`;
  } catch {
    return String(toolName ?? "");
  }
}

function emitClaude(decision, reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = (await readStdin()).trim();

  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  const toolName = args.tool ?? payload?.tool_name ?? null;
  const toolInput = payload?.tool_input ?? (args.state !== undefined ? args.state : undefined);
  const isClaudeHook = Boolean(payload?.tool_name) || Boolean(args.tool);

  const text = args.state ?? toolActionText(toolName ?? "tool", toolInput);
  const result = await runPack("guard", { tool: toolName ?? "tool", action: text });

  const decision = result.decision;
  // A deny is authoritative whether it came from a hard rule (code) or the
  // model — check it first so a provider outage can never downgrade it.
  // Offline (no provider / rules engine): the code hard rules already ran, so
  // allow the rest rather than making every tool call require confirmation.
  const offline = !result.ok || result.provider === "rules";

  let permission;
  let reason;
  if (decision?.action === "deny") {
    permission = "deny";
    reason = `JEV guard: ${decision.reason}${decision.hardRule ? ` (${decision.hardRule})` : ""}`;
  } else if (offline) {
    permission = "allow";
    reason = "JEV guard: no decision provider (hard rules only)";
  } else if (decision?.action === "allow") {
    permission = "allow";
    reason = `JEV guard: ${decision.choice ?? "low-risk"} (${decision.reason})`;
  } else {
    permission = "ask";
    const why = decision?.reason ?? result.error?.code ?? "error";
    reason = `JEV guard: confirm before running (${why})`;
  }

  if (isClaudeHook && !args.raw) {
    emitClaude(permission, reason);
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        tool: toolName,
        action: text,
        permission,
        reason,
        provider: result.provider,
        engine: result.engine,
        decision: result.decision,
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
    // Never crash a host hook on an internal error: fail closed (ask) via JSON.
    emitClaude("ask", `JEV guard internal error: ${String(error?.message ?? error)}`);
  });
}
