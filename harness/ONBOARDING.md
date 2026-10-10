# JEV Harness — Onboarding

A reusable, provider-neutral **decision layer** that plugs into a coding-agent
workflow. Code owns the workflow; **Jev** owns the bounded semantic decision;
the LLM owns generation; **Engram** gives every decision memory and an audit
trail. See `../JEV-HARNESS-PLAN.md` for the full design.

This directory ships four things:

| Path | What |
|---|---|
| `skills/jev-decide/SKILL.md` | The Agent Skill: *when* to call each pack |
| `mcp/` | Optional stdio MCP server exposing the packs as tools (Node built-ins only) |
| `install.sh` | Copies the skill into an agent's skills dir |
| `config.example.json` | Provider + memory + packs configuration |

The in-repo TypeScript source of truth lives in `src/lib/system-one/`; the skill
and MCP catalog mirror it. Keep them in sync.

---

## Part A — Human onboarding

### 0. Prerequisites

- **Node ≥ 20** (global `fetch`, `AbortSignal.timeout`).
- An agent that supports skills and/or MCP: **opencode**, **codex**, or
  **Claude Code**.
- *Optional:* a `JEV_API_KEY` (TypeSafe). Without a key the harness still runs
  with `DECISION_ENGINE=rules` (offline, explicit no-answers) — useful to wire
  everything up first.
- *Optional:* local [Engram](https://github.com/Gentleman-Programming/engram)
  (`JEV_MEMORY=engram`) for memory-augmented, auditable decisions.

### 1. Configure

```bash
cp harness/config.example.json harness/config.json   # then edit
```

Then put the secrets in your env (e.g. `.env.local`) — **never in the JSON**:

```bash
export DECISION_ENGINE=jev
export JEV_API_KEY=...            # or TYPESAFE_API_KEY
export JEV_MEMORY=engram          # engram | neon | none
export JEV_MEMORY_PROJECT=whatsapp-business-base
# export ENGRAM_HTTP_URL=http://127.0.0.1:7437
```

`config.json` is git-ignored by convention (it holds no secrets, but keep it
local). The MCP server finds it automatically, or via `JEV_HARNESS_CONFIG`.

### 2. Install the skill

```bash
bash harness/install.sh --agent opencode     # or: codex | claude
bash harness/install.sh --agent codex --global
bash harness/install.sh --target .opencode/skills --dry-run
```

Idempotent: re-running replaces only the `jev-decide` skill.

### 3. Register the MCP server (optional but recommended)

The agent can only *call the packs* once the MCP server is registered. Full
instructions (opencode, codex, Claude Code) are in `harness/mcp/README.md`.
Short version — `opencode.json`:

```jsonc
{
  "mcp": {
    "jev-harness": {
      "type": "local",
      "command": ["node", "harness/mcp/server.mjs"],
      "enabled": true,
      "environment": { "DECISION_ENGINE": "jev", "JEV_API_KEY": "{env:JEV_API_KEY}" }
    }
  }
}
```

Use an absolute path to `server.mjs` if you launch the agent from elsewhere.

### 4. Smoke test

Confirm the server speaks MCP and lists the tools (no key needed):

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
              '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node harness/mcp/server.mjs
```

You should see an `initialize` result and a `tools/list` result containing 14
tools (`jev_decide` + 13 packs). Then verify the app's own gate still passes:

```bash
npx tsc --noEmit && npx eslint src && npm test && npm run build
```

### 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `not_configured` error from a pack | No API key for the active engine. Set `JEV_API_KEY` or run `DECISION_ENGINE=rules`. |
| Every pack returns `no_answer:` | Rules fallback active (no key) — expected offline behaviour. |
| Tools don't appear in the agent | MCP server not registered, wrong path, or Node < 20. |
| `timeout` | Raise `DECISION_TIMEOUT_MS` / `provider.timeoutMs`. |
| Closed gate blocks unexpectedly | `ambiguity`/`scope-guard`/`guard` are `[closed]` and fail closed by design; check the `state`. |

---

## Part B — Agent onboarding

If you are an agent reading this: **read
`skills/jev-decide/SKILL.md` first** — it is the operating manual (pack catalog,
when to call each, fail posture, do-nots).

1. **Before a decision**, assemble `state` from context: the task, relevant
   memories (Engram: `mem_search` → `mem_get_observation` for FULL content,
   previews are ~300 chars), compact skill rules, and candidate files. Never
   include secrets/PII — `state` may leave the process to a hosted API.
2. **Call the right pack** (see the catalog). Prefer a named pack over
   `jev_decide`. For selection packs (`skill-route`, `test-impact`), pass
   `options` so the `choice` criteria are your real candidates.
3. **Act on `decision.allow` / `decision.action`.** `[open]` packs advise;
   `[closed]` packs block on uncertainty. Never bypass a closed gate.
4. **Persist the decision** to Engram so it is auditable and replayable:
   `mem_save(title, content, topic = "sdd/<change>/decisions/<phase>")`.
5. **Shadow first.** Log decisions; do not change behaviour until the ledger
   (plan §7) proves the pack earns its keep.
6. **Never** use a pack for counting/arithmetic/sorting (code), generation
   (LLM), ground truth (tests), or hard-rule enforcement (policy). No threshold
   without calibration; no `choice` without a fallback.

---

## Configuration reference

`provider`

| Field | Default | Notes |
|---|---|---|
| `engine` | `jev` | `jev` · `openai-decisions` · `rules` |
| `model` | `jev-latest` | pin an exact version once thresholds are tuned |
| `baseUrl` | `https://api.typesafe.ai` | `https://api.openai.com` for OpenAI decisions |
| `apiKeyEnv` | `JEV_API_KEY` | which env var holds the key |
| `timeoutMs` | `8000` | per-call timeout |

`memory`: `backend` (`engram`|`neon`|`none`), `project`.

`packs`: `{ "<pack-id>": { "enabled": bool, "threshold": number } }` — disable a
pack or override its threshold without touching code.

**Env vars:** `DECISION_ENGINE`, `JEV_API_KEY` / `TYPESAFE_API_KEY`,
`OPENAI_API_KEY`, `DECISION_BASE_URL`, `DECISION_MODEL`, `DECISION_TIMEOUT_MS`,
`JEV_MEMORY`, `JEV_MEMORY_PROJECT`, `ENGRAM_HTTP_URL`, `ENGRAM_HTTP_TOKEN`,
`JEV_HARNESS_CONFIG`.

## Security

- Secrets are read from env only; never echoed, logged, or written by the server.
- Request/response bodies are never logged (`state` may carry tenant data).
- `[closed]` packs fail closed; no-answer ⇒ no mutation, no reply.
- Engram is project-scoped developer memory. It is **not** the product's tenant
  memory (that is `knowledge_chunks`, `tenant_id`-scoped). Never cross them.
