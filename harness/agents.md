# JEV Harness across agents

The harness ships **two portable surfaces**:

1. **MCP server** — `harness/mcp/server.mjs`. The **universal** surface: every
   agent below speaks MCP, so the 14 `jev_*` tools work in all of them.
2. **Agent Skill** — `harness/skills/jev-decide/SKILL.md`. Teaches *when* to call
   each pack. Works in any agent that reads `SKILL.md` (opencode, codex, Claude
   Code, Cursor skills).

Prereq: a Jev key in `.env.local` (`JEV_API_KEY=ts_...`). The key is passed to the
MCP server **from the environment** — never inline it in a config file.

## Matrix

| Agent | Skill dir | MCP config | Key handling |
|---|---|---|---|
| **opencode** | `.opencode/skills/` | `opencode.json` → `mcp.jev-harness` | wrapper loads `.env.local` |
| **codex** | `.agents/skills/` | `~/.codex/config.toml` → `[mcp_servers.jev-harness]` | wrapper loads `.env.local` |
| **Claude Code** | `.claude/skills/` | `claude mcp add` (or `.mcp.json`) | wrapper loads `.env.local` |
| **Cursor** | `.cursor/skills/` (or `.agents/skills/`) | `.cursor/mcp.json` | wrapper loads `.env.local` |
| **Devin** | n/a (cloud, MCP-first) | Devin MCP settings | key in Devin's env/secrets |

### The wrapper (load `.env.local`, keep the key out of every config)

```bash
bash -lc 'cd "<REPO>" && set -a && . ./.env.local 2>/dev/null; set +a; exec node harness/mcp/server.mjs'
```

Use it as the MCP `command` wherever a shell is available (Windows: Git Bash ships
with the agents and runs it fine). Without a key the server still starts and
returns rules/no-answers, so registration never breaks an agent.

## Per-agent snippets

### opencode — `opencode.json`
```jsonc
{ "mcp": { "jev-harness": { "type": "local", "enabled": true,
  "command": ["bash","-lc","cd \"<REPO>\" && set -a && . ./.env.local 2>/dev/null; set +a; exec node harness/mcp/server.mjs"] } } }
```

### codex — `~/.codex/config.toml`
```toml
[mcp_servers.jev-harness]
command = "bash"
args = ["-lc", "cd \"<REPO>\" && set -a && . ./.env.local 2>/dev/null; set +a; exec node harness/mcp/server.mjs"]
```

### Claude Code
```bash
claude mcp add jev-harness -- bash -lc 'cd "<REPO>" && set -a && . ./.env.local 2>/dev/null; set +a; exec node harness/mcp/server.mjs'
```

### Cursor — `.cursor/mcp.json`
```jsonc
{ "mcpServers": { "jev-harness": {
  "command": "bash",
  "args": ["-lc","cd \"<REPO>\" && set -a && . ./.env.local 2>/dev/null; set +a; exec node harness/mcp/server.mjs"] } } }
```

### Devin (MCP settings / cloud)
Add an MCP server named `jev-harness`, `command: node`,
`args: ["<REPO>/harness/mcp/server.mjs"]`, `env: { DECISION_ENGINE: "jev",
JEV_API_KEY: "<your key>" }` (Devin has no local `.env.local`; put the key in
Devin's secret store).

## Install the skill

```bash
bash harness/install.sh --agent opencode     # or: codex | claude | cursor
bash harness/install.sh --agent codex --global
bash harness/install.sh --target .cursor/skills --dry-run
```

## Verify (any agent)

```bash
node --test harness/mcp/mcp.test.mjs
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node harness/mcp/server.mjs   # 14 tools
```

Then restart the agent so it picks up the new MCP entry + skill.
