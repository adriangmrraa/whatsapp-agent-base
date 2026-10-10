#!/usr/bin/env node
// ─── JEV harness MCP server (stdio) ──────────────────────────────────────────
//
// A small, dependency-light Model Context Protocol server that exposes the JEV
// decision packs (harness/mcp/packs.mjs) as MCP tools over the stdio transport.
// Node built-ins only — no npm dependencies.
//
// Tools: one `jev_<pack>` per pack, plus `jev_decide` (raw contract escape
// hatch). See harness/mcp/README.md for registration in opencode and codex.

import { loadConfig, createProvider, ProviderError } from "./provider.mjs";
import { PACKS, PACKS_BY_TOOL, applyPolicy, packQuestions, toolName } from "./packs.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "jev-harness-mcp", version: "0.1.0" };

let config = null;
let provider = null;
function getConfig() {
  if (!config) config = loadConfig();
  return config;
}
function getProvider() {
  if (!provider) provider = createProvider(getConfig());
  return provider;
}

function packTool(pack) {
  return {
    name: toolName(pack.id),
    description: `[${pack.posture}] ${pack.summary} (SDD: ${pack.sdds})`,
    inputSchema: {
      type: "object",
      properties: {
        state: {
          description: "The decision context: a string, object, or array of text/JSON. No secrets/PII.",
          type: ["string", "object", "array"],
        },
        options: {
          description: pack.optionsQuestion
            ? "Candidate option ids for this pack's choice question (a `none` fallback is added)."
            : "Ignored by this pack.",
          type: "array",
          items: { type: "string" },
        },
        model: { description: "Optional per-call model override.", type: "string" },
      },
      required: ["state"],
    },
  };
}

const RAW_TOOL = {
  name: "jev_decide",
  description:
    "Raw escape hatch: send an explicit JEV `questions` pack against `state` and get typed answers. Prefer a named pack when one fits.",
  inputSchema: {
    type: "object",
    properties: {
      state: { type: ["string", "object", "array"], description: "Text/JSON decision context." },
      questions: { type: "object", description: "A QuestionPack: id → { type: noul|choice|score, instructions, criteria? }." },
      model: { type: "string" },
    },
    required: ["state", "questions"],
  },
};

function listTools() {
  return { tools: [RAW_TOOL, ...PACKS.map(packTool)] };
}

function textResult(payload, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }], isError };
}

async function callTool(name, args = {}) {
  const p = getProvider();
  const model = typeof args.model === "string" ? args.model : undefined;

  try {
    if (name === "jev_decide") {
      const answers = await p.decide(args.state, args.questions, { model });
      return textResult({ provider: p.name, answers });
    }

    const pack = PACKS_BY_TOOL[name];
    if (!pack) return textResult(`unknown tool: ${name}`, true);

    const override = getConfig().packs?.[pack.id];
    if (override?.enabled === false) return textResult(`pack disabled by config: ${pack.id}`, true);
    const effective =
      override && typeof override.threshold === "number"
        ? { ...pack, policy: { ...pack.policy, threshold: override.threshold } }
        : pack;

    const questions = packQuestions(effective, args.options);
    const answers = await p.decide(args.state, questions, { model });
    const decision = applyPolicy(effective, answers);
    return textResult({ pack: pack.id, provider: p.name, decision, answers });
  } catch (error) {
    if (error instanceof ProviderError) {
      return textResult({ error: error.code, message: error.message, provider: p.name }, true);
    }
    return textResult({ error: "internal_error", message: String(error?.message ?? error) }, true);
  }
}

function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } };
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: listTools() };
      case "tools/call":
        return { jsonrpc: "2.0", id, result: await callTool(params?.name, params?.arguments ?? {}) };
      default:
        if (isNotification) return null;
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
    }
  } catch (error) {
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32603, message: String(error?.message ?? error) } };
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    void dispatch(msg).then((response) => {
      if (response) write(response);
    });
  }
});
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
