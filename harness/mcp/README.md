# JEV harness MCP server

A small, **dependency-light** stdio [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the JEV decision packs (`packs.mjs`) as MCP tools. Node
built-ins only — no npm dependencies, nothing to build.

- One tool per pack: `jev_context_prime`, `jev_file_scope`, `jev_skill_route`,
  `jev_workload_forecast`, `jev_ambiguity`, `jev_scope_guard`, `jev_test_impact`,
  `jev_triage`, `jev_acceptance`, `jev_blast_radius`, `jev_review`, `jev_verify`,
  `jev_guard`.
- Plus `jev_decide` — a raw escape hatch: send an explicit `questions` pack.

Each pack tool takes `{ state, options?, model? }` and returns JSON
`{ pack, provider, decision, answers }`. Act on `decision.allow` / `decision.action`.
`options` supplies candidate ids for the choice questions (a `none` fallback is
always added).

## Requirements

- Node ≥ 20 (uses global `fetch` and `AbortSignal.timeout`).
- A provider key — or none at all (the `rules` fallback and `DECISION_ENGINE=rules`
  work offline, returning explicit no-answers).

## Run it directly

```bash
node harness/mcp/server.mjs        # speaks MCP on stdin/stdout
```

Smoke test (feed one JSON-RPC line and watch the response):

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node harness/mcp/server.mjs
```

## Configure

The server reads `harness/config.json` (create it from `config.example.json`) or
the path in `JEV_HARNESS_CONFIG`, and merges `process.env` on top. Only the key
names matter here — see `../ONBOARDING.md`.

| Env | Meaning |
|---|---|
| `DECISION_ENGINE` | `jev` (default) · `openai-decisions` · `rules` |
| `JEV_API_KEY` / `TYPESAFE_API_KEY` | Jev key |
| `OPENAI_API_KEY` | OpenAI Decisions key (when engine is `openai-decisions`) |
| `DECISION_BASE_URL` / `DECISION_MODEL` / `DECISION_TIMEOUT_MS` | transport overrides |
| `JEV_MEMORY` | `engram` (default) · `neon` · `none` — informational here; used by the in-repo primer |
| `JEV_HARNESS_CONFIG` | path to a JSON config file |

## Add to opencode

Add an MCP entry to `opencode.json` (or `~/.config/opencode/opencode.json`):

```jsonc
{
  "mcp": {
    "jev-harness": {
      "type": "local",
      "command": ["node", "harness/mcp/server.mjs"],
      "enabled": true,
      "environment": {
        "DECISION_ENGINE": "jev",
        "JEV_API_KEY": "{env:JEV_API_KEY}"
      }
    }
  }
}
```

Use an absolute path to `server.mjs` if you launch opencode from another
directory. Set `DECISION_ENGINE=rules` to register the tools without any key.

## Add to codex

Register the server in your codex MCP config (`.codex/config.toml` or the
user-level equivalent):

```toml
[mcp_servers.jev-harness]
command = "node"
args = ["harness/mcp/server.mjs"]
env = { DECISION_ENGINE = "jev", JEV_API_KEY = "$JEV_API_KEY" }
```

## Add to Claude Code

```bash
claude mcp add jev-harness -- node "$(pwd)/harness/mcp/server.mjs"
```

Then set `DECISION_ENGINE` / `JEV_API_KEY` in the environment.

## Security

- **Never** log request or response bodies — `state` may carry tenant data.
- Provider keys are read from env only; they are never echoed or written.
- `guard`, `ambiguity`, `scope-guard` are `[closed]`: no-answer or low signal →
  the server returns `decision.allow: false` (fail closed).

## Tests

Self-contained, dependency-free ([`mcp.test.mjs`](./mcp.test.mjs)):

```bash
node --test harness/mcp/mcp.test.mjs
```

It is intentionally **not** part of the app's `npm test` (whose glob is
`src/**/*.test.ts`) and, being plain `.mjs`, it is excluded from the app's `tsc`.
