// ─── JEV hooks — opencode plugin adapter ─────────────────────────────────────
//
// opencode loads plugins from `.opencode/plugins/` (project) or
// `~/.config/opencode/plugins/` (global). Copy or symlink this file there, or
// point `plugin` at it. It reuses the SAME provider + packs as the MCP server
// via ./runner.mjs.
//
// Hook used: `tool.execute.before` — throwing prevents the tool from running.
//   deny  → throw (blocked)
//   ask   → throw with a "confirm first" message (opencode has no inline prompt
//           here, so we refuse and ask the agent to get explicit approval)
//   allow → no-op
//
// Offline (engine "rules") degrades to hard-rules-only: the code layer still
// denies, everything else is allowed so the harness stays usable.
//
// Note: opencode has no hard Stop gate. The `event` hook below emits an
// advisory on `session.idle`; the deterministic Stop check lives in
// ./stop-done.mjs and the universal cron wrapper (harness/hooks/cron-triage).

import { runPack } from "./runner.mjs";

const GUARDED_TOOLS = new Set(["bash", "write", "edit", "patch", "multiedit"]);

export function toolActionText(tool, args) {
  if (!args) return String(tool ?? "tool");
  if (typeof args === "string") return args;
  if (typeof args.command === "string") return args.command;
  if (typeof args.filePath === "string") return `${tool} ${args.filePath}`;
  if (typeof args.file_path === "string") return `${tool} ${args.file_path}`;
  try {
    return `${tool} ${JSON.stringify(args)}`;
  } catch {
    return String(tool ?? "tool");
  }
}

export const JevGuardPlugin = async ({ client } = {}) => {
  const log = async (level, message, extra) => {
    try {
      await client?.app?.log?.({ body: { service: "jev-hooks", level, message, extra } });
    } catch {
      /* logging is best-effort */
    }
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (!GUARDED_TOOLS.has(input?.tool)) return;
      const action = toolActionText(input.tool, output?.args);
      const result = await runPack("guard", { tool: input.tool, action });
      const decision = result.decision;

      // A deny is authoritative regardless of provider state (hard rule or model).
      if (decision?.action === "deny") {
        const detail = decision.hardRule ? ` [hard rule: ${decision.hardRule}]` : "";
        throw new Error(`JEV guard denied this tool call (${decision.reason})${detail}`);
      }
      // Offline: hard rules already ran in code; allow the rest.
      if (!result.ok || result.provider === "rules") return;
      if (decision?.action === "allow") return;
      throw new Error(
        `JEV guard requires explicit user confirmation before this tool call (${decision?.reason ?? "unknown"}). Ask the user to approve, then re-run.`,
      );
    },

    event: async ({ event } = {}) => {
      if (event?.type === "session.idle") {
        await log("info", "session idle: run the JEV stop-check (harness/hooks/stop-done.mjs) before declaring done");
      }
    },
  };
};

export default JevGuardPlugin;
