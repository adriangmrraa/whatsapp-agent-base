# JEV Harness — Usage Audit (whatsapp-business-base / whatsapp-agent-base)

Read-only, evidence-backed audit of the JEV decision harness shipped in Phases
0–8 (`origin/main` tip `f56a2ac`) plus the unmerged `jev-harness-hooks` branch.

- **Worktree audited:** `C:/Users/Asus/orca/workspaces/whatsapp-business-base/jev-usage-audit` (branch `jev-usage-audit`)
- **Base commit:** `f56a2ac` (includes all jev-harness work)
- **Agents in scope:** Codex CLI, opencode, Devin
- **Question:** was the harness *really used*, by *whom*, and which decisions were harness-made vs LLM-made?

> Scope note: two decision paths coexist in this repo and must not be conflated.
> **(A) Dev harness** = `src/lib/system-one/{provider,harness,ledger,packs,eval}`, `harness/sdd/*`, `harness/mcp/*`, `scripts/jev-report.ts`. **(B) Production path** = `src/lib/system-one/{hosted,config,registry,index}.ts` + `decideForTurn` (per-tenant `/v1/decisions`, wired into `src/lib/agent/index.ts`). Every finding below states which path it belongs to.

---

## TL;DR

- The harness was **built, wired, and smoke-tested — never used to make a real coding decision.**
- **Zero** decision samples were persisted anywhere (no ledger JSON, no `sdd/*/decisions/*` Engram key, no `jen_memory` row).
- The only agent that touched the repo is **opencode** (Orca worktrees + `gentle-orchestrator` + `sdd-*`/`build` subagents, model `deepseek-flash`). Every jev commit is authored by the human (`Adrian Gamarra <gamarraadrian200@gmail.com>`); the LLM drove content, the human owned commits.
- **codex** had the MCP server globally configured but made **0** `jev_*` tool calls and never worked on this repo's harness.
- **devin** left **no** local artifact anywhere.
- Harness-made decisions ≈ **1 live smoke + a handful of offline/rules smoke calls + 6 mocked fixture samples**; **0** influenced any code change. LLM-made decisions = **100%** of the real work.

---

## 1. Provenance table

`source` = who/what produced the decision artifact. `count` = observed instances in the audit window.

| Decision source | Path | Agent | Evidence | file:line | count |
|---|---|---|---|---|---|
| Shadow pack runner (`createShadowRunner`) | A (harness) | opencode (author smoke) | `JEV_HARNESS_SDD=1 JEV_MEMORY=none DECISION_ENGINE=rules npx tsx harness/sdd/shadow-wiring.mts` | `harness/sdd/shadow-wiring.mts:92`, `harness/shadow-runner.ts:120,157` | 1 real run (+1 disabled no-op) |
| Shadow measurement primitive (`measureDecide`) | A | opencode (tests + runner) | reached only via `runShadow`/`runAb`/shadow-runner | `ledger/types.ts:110` | 0 outside tests except the fixture |
| Shadow ledger sink (`ShadowLedger`) | A | opencode (eval only) | instantiated only by the golden eval | `ledger/shadow.ts:70`, `eval/runner.ts:203` | 0 persisted |
| A/B runner (`runAb`) | A | opencode (report only) | `npm run jev:report` (offline fixture) | `scripts/jev-report.ts:97`, `ledger/ab.ts:191` | 6 synthetic samples |
| MCP tools `jev_guard`/`jev_file_scope`/`jev_decide` | A (MCP mirror) | opencode (author smoke) | piped JSON-RPC into `node harness/mcp/server.mjs` | `harness/mcp/server.mjs:82,87` | ~5 smoke calls |
| Decision Provider block (`emit-decision-provider`) | A | opencode (author smoke) | `JEV_HARNESS_SDD=1 DECISION_ENGINE=jev` (renders key PRESENCE only) | `harness/sdd/emit-decision-provider.mts:22` | 1 |
| Live provider smoke (`createJevProvider.decide`) | A (provider adapter) | opencode (orchestrator) | `npm run onboard -- --jev` → `[ ok ] Decision layer — provider=jev answer=noul` | `scripts/onboard.ts:112,126,132` | 1 (real network) |
| Production turn decision (`decideForTurn`) | B (production) | — | no runtime evidence; no live traffic in audit | `src/lib/agent/index.ts:52`, `index.ts:63` | 0 |
| SDD process docs (`sdd/jev-harness-*/<phase>`) | A (process, not decisions) | opencode SDD subagents | Engram topic keys (proposal/spec/design/tasks/apply-progress/verify-report/explore) | Engram obs #5102–#5163 | ~20 |

**Key structural fact:** in `src/` (non-test), the harness functions have **no production caller**. `resolveDecisionProvider`/`getDecisionProvider` (`provider/registry.ts:142,154`) are called only by the SDD CLI and tests; `createShadowRunner` only by `harness/sdd/shadow-wiring.mts`; `runAb` only by `scripts/jev-report.ts`; `runShadow`+`ShadowLedger` only by `eval/runner.ts`. The lone production entry point is `decideForTurn` (path B), which does **not** touch the harness.

---

## 2. Per-agent verdict

### opencode — **PARTIALLY** (built + smoke-tested; not used to decide) — confidence 0.90

**It is the only agent present in the repo.** Evidence:

- **Orca worktrees** created for each phase on 2026-10-10 under `C:/Users/Asus/orca/workspaces/whatsapp-business-base/` (`jev-harness-foundation`, `-packs`, `-ledger`, `-packaging`, `-memory-scope`, `-policy`, `-sdd-integration`, `-onboarding`, `-docs`, `-hooks`). Today only `jev-usage-audit` remains; the rest were cleaned up.
- **opencode session DB / log** (`~/.local/share/opencode/opencode.db`, `log/opencode.log`): each of the 10 `build` sessions is bound to one worktree (e.g. `ses_ed96acda...` → `jev-harness-foundation`, `ses_ed8c2e3e...` → `jev-harness-docs`, `ses_ed7c93dd...` → `jev-harness-hooks`). Parent `ses_ed991c575ffe...` (agent `build`) and `agent=gentle-orchestrator` dispatched the SDD flow (`sdd-explore|propose|spec|design|tasks|apply|verify`, 4607+ `sdd-apply` events, 1150 `sdd-verify`).
- **Project MCP wiring:** `opencode.json` in the main checkout registers `mcp.jev-harness` (stdio, `harness/mcp/server.mjs`, wrapper sources `.env.local`). The `jev-decide` skill is installed at `.opencode/skills/jev-decide/SKILL.md`.
- **Author smoke tests** (all by opencode, from the log):
  - `DECISION_ENGINE=rules node harness/mcp/server.mjs` + piped `jev_guard`/`jev_file_scope` (2026-10-10 17:00).
  - `npm run jev:report` (2026-10-10 17:02).
  - `emit-decision-provider.mts` + `shadow-wiring.mts` with `JEV_MEMORY=none DECISION_ENGINE=rules` (2026-10-10 18:34).
  - MCP e2e probe with `jev_guard` (2026-10-10 23:13).
- **BUT the harness was never used as a decision aid.** `opencode.db` has **0** `part` rows whose tool name matches `jev_*`; the only `jev_*` invocations were manual `printf | node …` bash smoke tests. Every `shadow-wiring` run used the offline `rules` engine and `JEV_MEMORY=none`, so nothing persisted.

### codex — **NEVER** — confidence 0.90

- `~/.codex/config.toml:314` has a **global** `[mcp_servers.jev-harness]` block pointing at the same wrapper server, so the *name* appears in codex session context — but that is configuration, not usage.
- Across **all** codex rollouts (`~/.codex/sessions`, `archived_sessions`): **0** files contain a `jev_*` tool call (`"name":"jev_`). The sessions that matched `whatsapp-business-base` are explained by the MCP config path appearing in the system prompt; their `cwd` is other projects (dentalogic, ah sports, Hackaton Solana). Case-insensitive `jev` hits were base64/PNG noise.
- `~/.codex/hooks.json`, `rules/`, `skills/`, `agents.md`, `history.jsonl`, `session_index.jsonl`: no jev-harness traces.

### devin — **NEVER** — confidence 0.85

- No `.devin/` in the repo or main checkout; no `~/.devin`; no Devin session artifacts under Orca or engram. The install guide documents a Devin snippet (`harness/AGENTS.md`) but there is no trace it was ever configured or run.

### Not one of the three (for completeness)

- A **`.kilo`** agent-manager left a worktree `.kilo/worktrees/incongruous-attack` at detached `92ea7e9` (a docs snapshot). Not codex/opencode/devin; no harness invocation.

---

## 3. Timeline of real harness invocations

All times local (`America/Buenos_Aires`, −03). None produced a code-changing decision.

| When | Entry point | Agent / session | Engine | Effect |
|---|---|---|---|---|
| 2026-10-10 17:00 | `DECISION_ENGINE=rules node harness/mcp/server.mjs` + piped `jev_guard`, `jev_file_scope` | opencode `build` → `jev-harness-packaging` (`run=31ddd481`) | rules | smoke answers only |
| 2026-10-10 17:02 | `npm run jev:report` | opencode `build` → `jev-harness-ledger` (`run=aadd0093`) | mocked fixture | 6 synthetic samples, gate PASS |
| 2026-10-10 18:34 | `JEV_HARNESS_SDD=1 DECISION_ENGINE=jev npx tsx harness/sdd/emit-decision-provider.mts` | opencode `build` → `jev-harness-sdd-integration` (`run=ee133b34`) | jev (render only) | prints provenance block; no provider call |
| 2026-10-10 18:34 | `JEV_HARNESS_SDD=1 JEV_MEMORY=none DECISION_ENGINE=rules npx tsx harness/sdd/shadow-wiring.mts --change demo --phase explore` | same | rules | shadow run, `acted=false`, **not persisted** |
| 2026-10-10 23:11 | `npm run onboard -- --jev --no-db --agent opencode` | opencode `gentle-orchestrator` main (`run=9f2b9908`) | **jev (live network)** | smoke decision `answer=noul`; installed skill to `.opencode/skills/jev-decide` |
| 2026-10-10 23:13 | MCP e2e probe (`initialize`+`tools/list`+`jev_guard`) | same | rules | smoke answer only |
| 2026-10-12 (audit) | `scripts/jev-audit-probe.ts` | opencode `build` → `jev-usage-audit` | jev (stubbed fetch) | **SYNTHETIC** — proves wiring, no network |

The **only** call that reached the live Jev API through harness code was the `onboard` smoke test
(`createJevProvider(...).decide(...)`, `scripts/onboard.ts:132`): question *"Return a high probability if this text contains the words 'smoke test'"* → answered `noul`. It is a synthetic reachability probe, not a workflow decision, and it produced no `DecisionSample`.

---

## 4. Persisted samples (the per-agent attribution key)

There are **none**. Exhaustive check:

- **Engram** (`project whatsapp-agent-base`): topic keys under `sdd/jev-harness-*/{proposal,spec,design,tasks,apply-progress,verify-report,explore}` exist — these are **SDD process artifacts**, not decisions. **No** key matches the harness's own contract `sdd/<change>/decisions/<phase>` (`harness/shadow-runner.ts:88`).
- **Filesystem:** no shadow-ledger/sample JSON anywhere outside test fixtures (`find` for `*ledger*/*sample*/*shadow*` returns only source and `docs/jev-harness-ledger.md`).
- **`jen_memory` (drizzle 0005/0006):** cannot be populated locally — the main checkout's `.env.local` holds only `JEV_API_KEY`, `DECISION_ENGINE=jev`, `DECISION_PROVIDER=jev` (no `DATABASE_URL`), and `shadow-wiring` ran with `JEV_MEMORY=none`.

### Ledger schema has no attribution field (confirmed)

`DecisionSample` (`ledger/types.ts:62`) fields are exactly:

```
provider, mode, packId, inputTokens, outputTokens, costUsd, latencyMs, error?, timestamp
```

A synthetic probe through the real path (`scripts/jev-audit-probe.ts`, run 2026-10-12) printed the sample and asserted
`agent/source/actor field present: false`. **The ledger cannot attribute a decision to an agent, session, or commit as shipped.**

---

## 5. Harness-vs-LLM decision split (ledger A/B)

- **LLM-made:** effectively everything. The 24 jev commits on `main` (provider `5fa86b5`, context `3127d69`, packs `6488fdd`, ledger `1e0f771`, packaging `90e1f0f`, memory `7827784`, SDD `dfb66df`, policy `f925303`, eval `7429168`, onboarding `214a267`, docs `c9278b1`) plus the four unmerged hook commits (`300b661`, `b616217`, `d65771e`, `cb01b10`) were authored by the opencode LLM agents under human commit ownership. No pack gated any of this work.
- **Harness-made:** the A/B report is a **mocked fixture** (`scripts/jev-report.ts:60–88`, `reportFromFixture`): 3 tasks × (baseline `openai-decisions` + candidate `jev`), both `fixtureProvider`, offline. Output: 6 samples, `gate: PASS — activate`. The repo's own doc labels it honestly: *"a demonstration of the mechanism, not a claim about production savings"* (`docs/jev-harness-ledger.md:119`).
- **Real A/B / promotion:** none. No pack was ever exercised by a real decision, so the shadow → measure → A/B → gate pipeline has **0 real samples** to gate on.

---

## 6. Environment presence (names only; values never printed)

`C:/Users/Asus/Documents/estabilizacion/Mrs Muzzarella/whatsapp-business-base/.env.local`:

| Key | Status |
|---|---|
| `JEV_API_KEY` | **set** (appears twice; value redacted) |
| `DECISION_ENGINE` | set (`jev`) |
| `DECISION_PROVIDER` | set (`jev`) |
| `JEV_MEMORY` | **absent** |
| `DATABASE_URL` | **absent** (so `jen_memory` unreachable locally) |

Repo `.env.example` documents the harness vars; no secret is committed.

---

## 7. Top instrumentation gaps (to make per-agent runtime usage provable)

1. **No actor on the sample.** `DecisionSample` lacks `agent`/`actor`/`source`/`sessionId`/`commit`. Thread it from the caller and stamp it in `measureDecide` (`ledger/types.ts:110`). *Without this, per-agent attribution is impossible by construction.*
2. **MCP server is a disconnected mirror.** `harness/mcp/server.mjs` reimplements packs/provider in `.mjs` and does not import `src/` or the ledger (`harness/mcp/server.mjs:11–12`). MCP calls therefore produce **no** sample and no server-side log. Either have the MCP server write a JSONL sample per call or import the TS ledger.
3. **Persistence is opt-in and defaulted-off in practice.** The only shadow CLI persists via an injected `MemoryProvider`; the single real run used `JEV_MEMORY=none`. Add an append-only `harness/ledger.jsonl` written by `runShadow`, `shadow-wiring`, and the MCP server.
4. **No MCP client-usage trace.** `opencode.json` enables `mcp.jev-harness`, but `opencode.db` has 0 `jev_*` tool parts — there is no log proving the client ever launched the server. Log server `initialize` with client name + timestamp.
5. **Empty state has no timestamp attribution.** Ledger `aggregate`/`formatStatsReport` report provider totals but no time window or agent filter. Add `--since` and actor grouping.
6. **Config is per-agent and unverified.** codex's `[mcp_servers.jev-harness]` and opencode's `opencode.json` are wired, but nothing asserts a successful handshake per agent; a startup self-check would turn "configured" into "verified".
7. **The `env` that enabled this is gitignored/local-only.** "JEV_API_KEY was configured" lives only on one machine; re-audits depend on the filesystem, not on recorded evidence.

---

## 8. Reproduce this audit

```bash
npm install
npm run jev:report                        # offline fixture: 6 synthetic samples (not real usage)
npx tsx scripts/jev-audit-probe.ts        # SYNTHETIC: real wiring + stubbed fetch, no key/network
npx tsc --noEmit && npx eslint src         # gates: 0 errors
```

Static trace: `grep -rn "resolveDecisionProvider\|createShadowRunner\|runAb\|runShadow\|ShadowLedger" src scripts` (all non-test callers are the SDD CLI, `scripts/jev-report.ts`, and `eval/runner.ts`).

---

## 9. Commit map (all authored by the human)

`main`: `5fa86b5`(provider) `3127d69`(context) `6488fdd`(packs) `1e0f771`(ledger) `90e1f0f`(packaging) `7827784`(memory) `dfb66df`(sdd) `f925303`(policy) `7429168`(eval) `214a267`(onboard) `c9278b1`(docs) `be07535` `92ea7e9` `f56a2ac` — merges `411a1c1` `3fad8c0` `b4c37b7` `e776ae4` `6dfb25e` `8c40db7` `e77079b` `312b314` `312e29b`.
Unmerged `jev-harness-hooks`: `300b661` `b616217` `d65771e` `cb01b10`.
Author on every commit: `Adrian Gamarra <gamarraadrian200@gmail.com>`.
