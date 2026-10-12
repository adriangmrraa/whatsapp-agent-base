# JEV lifecycle hooks

Deterministic **safety** (a guard before a tool runs) and **autonomy** (a check
before the agent stops), plus a **configurable cron trigger** that decides
whether to wake an agent. Every hook calls the **same provider and packs as the
MCP server** (`../mcp/*.mjs`, via `./runner.mjs`) — one config, one policy
engine, no drift.

```
harness/hooks/
├── runner.mjs          runPack(packId, state) — the single source of truth glue
├── bands.mjs           0.9 auto / 0.5 flag (mirrors policy.ts bandsOf)
├── gate-pretool.mjs    PreToolUse GATE  → guard pack (hard rules in code, then 5-way risk)
├── stop-done.mjs       Stop DONE        → checks.sh (code) + verify pack + bands + turn-cap
├── checks.sh           evidence collector (JEV_CHECKS_CMD)
├── opencode-plugin.mjs opencode adapter (tool.execute.before)
├── claude-hooks.json   Claude Code settings snippet
├── cron-triage/        external, configurable trigger using the triage pack
└── hooks.test.mjs      node:test, no deps
```

## The GATE — PreToolUse (safety)

`gate-pretool.mjs` runs before a tool. The `guard` pack runs the **hard rules in
CODE first** (`rm -rf /`, `git push --force`, pipe to `sh`/`bash`), then a
5-way risk `choice` (`read_only | local_edit | destructive | external | other`):

| Signal | Verdict |
|---|---|
| hard rule (code) | **deny** |
| injection / destructive / exfiltration / irreversible above cutoff | **deny** |
| `destructive` | **deny** |
| `external` | **ask** |
| `read_only` / `local_edit` with confidence ≥ band (0.5) | **allow** |
| `other`, low confidence, or no signal | **ask** |

**Never auto-approves.** A deny from the code layer is authoritative even if the
provider is down.

- **Claude Code:** input `{ tool_name, tool_input }` on stdin; output
  `hookSpecificOutput.permissionDecision` (`allow`/`deny`/`ask`).
- **Offline posture:** with no provider (`DECISION_ENGINE=rules` or a missing
  key) the semantic layer has no signal, so the hook degrades to the code hard
  rules and allows the rest. Blocking every tool offline would be unusable; the
  non-negotiable gate is the code layer.

## The DONE check — Stop (autonomy)

`stop-done.mjs` runs when the agent wants to stop:

1. **CODE:** run `checks.sh` (or `$JEV_CHECKS_CMD`). Its exit code is the floor —
   a failing check always blocks the stop.
2. **JEV:** the `verify` pack judges whether the evidence covers the goal.
3. **BANDS:** `≥0.9` stop · `0.5–0.9` stop **and write `REVIEW.md`** · `<0.5`
   block and keep going.
4. **TURN-CAP in code:** after `$JEV_STOP_MAX_TURNS` (default 8) attempts, stop
   regardless — escaping an unresolvable loop is code's job.

Claude Code output: `{ "decision": "block", "reason": "..." }` to keep going;
nothing to allow the stop.

## The TRIGGER — cron-triage (external)

`cron-triage/wake.mjs` uses the `triage` pack to decide whether a scheduled tick
or an incoming event should **wake an agent**. See
[`cron-triage/README.md`](./cron-triage/README.md).

> **Cron is an external wrapper, not an agent feature.** No coding agent ships a
> scheduler to trust; the timer belongs to the OS (cron, systemd-timer, a cloud
> scheduler) or an event source (webhook). The cadence is **configurable and
> never hardcoded** (no "every 15 minutes").

## Install per agent

| Agent | Gate (PreToolUse) | Stop check |
|---|---|---|
| **Claude Code** | native `PreToolUse` hook → `gate-pretool.mjs` | native `Stop` hook → `stop-done.mjs` |
| **opencode** | plugin `tool.execute.before` → `opencode-plugin.mjs` | `session.idle` event is advisory (no hard block); run `stop-done.mjs` from cron |
| **codex** | plugins / `/hooks` → call `gate-pretool.mjs` | run `stop-done.mjs` from cron |
| **cursor** | adapter (wrap the Claude hook contract) | via the adapter / cron |
| **Devin** | MCP/cloud-first; no local hook — rely on the MCP `jev_guard` tool | cron |
| **any** | — | **cron** (universal, external) |

Claude Code: merge `claude-hooks.json` into `.claude/settings.json`. opencode:
copy `opencode-plugin.mjs` into `.opencode/plugins/` (or reference it) and
restart. See [`../agents.md`](../agents.md) for MCP skill/config snippets.

## Configuration

| Env | Meaning |
|---|---|
| `DECISION_ENGINE`, `JEV_API_KEY` | Same provider config as the MCP server. |
| `JEV_CHECKS_CMD` | Evidence command for the Stop check (default: the repo gate). |
| `JEV_STOP_MAX_TURNS` | Turn-cap for the Stop check (default 8). |
| `JEV_STOP_GOAL` | Goal text fed to `verify` (else the session goal). |
| `JEV_STOP_REVIEW_PATH` | Where `REVIEW.md` is written (default repo root). |
| `JEV_HOOKS_STATE_DIR` | Where the stop-attempt counter lives (default `.jev-hooks/`). |
| `JEV_TRIAGE_INTERVAL_MS`, `JEV_WAKE_CMD` | cron-triage (see its README). |

## Verify

```bash
node --test harness/hooks/hooks.test.mjs
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node harness/hooks/gate-pretool.mjs   # deny
JEV_CHECKS_CMD='echo ok' node harness/hooks/stop-done.mjs --raw                                        # stop
node harness/hooks/cron-triage/wake.mjs --state "ci failed after deploy"                               # no wake (offline)
```

## The 7 rules of Jev engineering

1. **Code owns the workflow and every irreversible action.** Jev only makes a
   bounded decision; it never executes one.
2. **Ask the smallest typed question:** `noul` for yes/no, `choice` for
   pick-one (always a fallback), `score` for a rubric; multi-label = several
   `noul`.
3. **Hard rules live in CODE first.** If you can encode a rule (a destructive
   command shape), never delegate it to a model.
4. **Thresholds and bands live in policy, ship uncalibrated**, and are tuned on
   labeled data; a missing threshold fails closed.
5. **Fail posture is explicit.** `closed` packs protect (no signal → do not
   proceed); `open` packs advise.
6. **Never auto-approve the ambiguous.** `other`/low-confidence → ask; destructive
   → deny; external → ask.
7. **Measure and remember every decision.** Shadow-first, ledger-gated, and
   persisted to memory as an audit trail and eval set.
