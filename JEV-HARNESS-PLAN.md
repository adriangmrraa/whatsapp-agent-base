# JEV Harness — Master Plan

**Status:** proposed (planning complete, build not started)
**Owner:** adriangmrraa / Fusa Labs
**Repo:** `whatsapp-business-base`
**Date:** 2026-10-10

A reusable, provider-neutral **decision layer** built on [Jev](https://docs.typesafe.ai)
(TypeSafe "System One"), with **OpenAI Decisions API** as a second provider, that
(a) plugs into the local SDD coding-agent harness and (b) ships inside this repo so
students and the community can use it with a single `JEV_API_KEY` env var.

> One sentence: **code owns the workflow; Jev owns the bounded semantic decisions;
> the LLM owns generation; Engram gives every decision memory.**

---

## 0. Executive summary

- **Jev** takes a `state` + typed `questions` and returns **typed probabilistic
  `answers`** (`noul` / `choice` / `score`) — no generated text. It cannot emit an
  invalid type, is ~10×–100× cheaper and faster than a frontier LLM call on bounded
  decisions, and is **not deterministic** (it returns calibrated probabilities; the
  determinism lives in the surrounding threshold/policy code).
- The **biggest token sink** in a coding harness is **reading + searching** (~46–56%
  of tokens/turns), not generation. So the highest-leverage insertion is
  **context selection** — *which files, folders, docs, memories, tests* enter the
  context — not "replacing LLM turns".
- **Engram can (and should) feed Jev's `state`.** Before each decision the harness
  retrieves relevant observations (`mem_search` → `mem_get_observation`) and builds
  the `state`. This makes decisions **memory-augmented** and improving across
  sessions. (Jev has no "system prompt"; memory goes into `state`.)
- Ship **four layers**: `provider/` (transport), `packs/` (decision recipes),
  `policy.ts` (thresholds + fail posture), `ledger/` (shadow + A/B + stats).
- Adoption is **shadow-first, evidence-gated**: no behavior changes until the ledger
  proves the pack earns its keep.

---

## 1. What Jev is and the real contract

### 1.1 Jev (TypeSafe System One) — official contract

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer  $TYPESAFE_API_KEY   (alias: $JEV_API_KEY)
Content-Type: application/json

{
  "model": "jev-latest",              // pin "jev-1.13.0" when thresholds are tuned
  "state": <string | object | array>, // text only; no images
  "questions": {
    "<id>": { "type": "noul",  "instructions": "..." },
    "<id>": { "type": "choice","instructions": "...", "criteria": { "<opt>": "<desc>", ... } },
    "<id>": { "type": "score", "instructions": "...", "criteria": ["lvl0","lvl1",...] }
  }
}
```

Response:

```
{ "model": "jev-1.13.0",
  "answers": {
    "<id>": { "type":"noul",   "noul": 0.0-1.0 },
    "<id>": { "type":"choice", "choice":"<opt>", "confidence":0-1, "probabilities": { ... } },
    "<id>": { "type":"score",  "score": 0.0-n, "confidence":0-1, "probabilities": { ... }, "legend": { ... } }
  },
  "usage": { "input_tokens": N, "output_tokens": M } }
```

Facts that shape the design:

- **Primitives:** `noul` (probability of yes, absolute), `choice` (pick 1 of ≤255,
  relative), `score` (position on an ordered 2–10 level rubric).
- **Budget:** 64k total; **32k for `state` + the longest question**. State is billed
  once per request; each additional question is nearly free → **batch questions**.
- **SDKs:** `@typesafe-ai/sdk` (Node ≥20), `typesafe-sdk` (Python). Builders
  `choice()/score()/noul()`, retries handled.
- **Price:** ≈ **$0.042 / 1M input tokens**, output free.
- **Text only.** Question IDs are never sent to the model — put all meaning in
  `instructions`/`criteria`.

### 1.2 OpenAI Decisions API (second provider)

```
POST https://api.openai.com/v1/decisions      // public beta since 2026-10-06
Authorization: Bearer $OPENAI_API_KEY
{ "model": "gpt-6-luna", "input": <text|messages>, "questions": [ {type,name,instructions,choices|levels} ] }
→ { "answers": [ { name, ... } ] }
```

- Types: `predicate` ≈ `noul`, `choice`, `score`.
- **Text + inline base64 images**; much larger context; **$0.10 / 1M input, no output charge**.
- Can return a `refusal` — handle it (→ review/human).
- **No documented calibration contract** → treat as a score, threshold on your data.
- Compatible via gateways (Vercel AI Gateway `openai/gpt-6-luna-decisions`, OpenRouter).

### 1.3 Provider-neutral contract

```ts
interface DecisionProvider {
  name: string; // "jev" | "openai-decisions" | "rules"
  decide<T extends QuestionPack>(state: State, questions: T): Promise<AnswerMap<T>>;
}
```

`noul ↔ predicate`, `choice ↔ choice`, `score ↔ score`. Switching providers is a
config/env change, not a rewrite. Provider precedence for the decision service:
**explicit config → env → rules fallback** (rules never call the network).

---

## 2. Memory-augmented decisions: using Engram as Jev context

### 2.1 Answer: yes — Engram feeds `state`, not a "system prompt"

Jev has **no system prompt**. It accepts `state` (arbitrary text/JSON) plus typed
questions. So the pattern is:

```
retrieve relevant memory (Engram)  →  build `state`  →  call Jev  →  typed answer
        ▲                                                              │
        └──────────────  mem_save(decision + rationale)  ◄─────────────┘
```

Concretely, for any decision the harness can assemble:

```jsonc
{
  "task": "<the change request / user prompt>",
  "memories": [            // from mem_search + mem_get_observation (top-k, curated)
    "sdd/<change>/design", "sdd/<change>/tasks", "<pinned project conventions>"
  ],
  "rules":   [ "<compact rules from skill-registry>" ],
  "candidates": [ { "path": "...", "snippet": "..." } ],   // for selection packs
  "facts":   { "tenantId": 12, "role": "admin" }
}
```

The answer is then consumed in code (thresholds) and the **decision itself is
persisted back to Engram** (`sdd/<change>/decisions/<phase>`) for audit, replay, and
as an **eval set** to calibrate thresholds.

### 2.2 The ContextPrimer (the glue)

A single component, reused by every pack:

```
ContextPrimer.build(packId, task):
  1. mem_search(pack-relevant queries) → ids          (parallel)
  2. mem_get_observation(id) → full content           (parallel; previews are 300 chars!)
  3. read skill-registry compact rules for the task
  4. (optional) codebase-memory / grep → candidate files (paths + snippets only)
  5. trim to a token budget (≤ ~8–12k) and return `state`
```

### 2.3 Constraints and rules (hard)

- **32k state budget** → retrieve **top-k curated**, never dump. State is billed every call.
- **Engram previews are 300 chars** → always `mem_get_observation` for full content.
- **No secrets/PII in `state`** (Engram is local, but state may leave the process to a
  hosted API). Reuse the repo's redaction rules (`docs/security.md`).
- **Question IDs are not sent to the model** → meaning must live in the question text.
- For the **multi-tenant product**, Engram (project-scoped) is NOT the tenant memory.
  Tenant memory is `knowledge_chunks` (pgvector, `tenant_id`-scoped). The dev-harness
  uses Engram; the product uses pgvector. Never cross them.

### 2.4 Why this matters

Decisions get **better over sessions** (memory accumulates), stay **auditable**
(every decision is an observation), and become **replayable** (rerun the same state
against a new model/threshold). This is the differentiator vs. a stateless classifier.

---

## 3. Decision-point catalog

Legend: **★** = leverage (how much token/time/quality it moves). **F** = fail posture
(open = advisory, closed = protective).

### 3.1 Core coding-loop points (TypeSafe's canonical five)

| Decision | Type | ★ | F |
|---|---|---|---|
| Model routing (cheap/mid/frontier) | `choice` | ★★★ | open |
| Tool selection (which tool / none) | `choice` | ★★★★ | open |
| Context compaction (keep/summarize/drop) | `score` | ★★★ | open |
| Loop detection (repeating without progress?) | `noul` | ★★★ | open |
| Risk gate (destructive? allow/confirm/block) | `noul`+`choice` | ★★★★ | **closed** |

### 3.2 SDD-phase points (mapped to this repo's SDD skills)

| # | Decision | SDD skill / artifact | Type | ★ |
|---|---|---|---|---|
| 1 | **Context priming** — which memories/docs/rules | orchestrator + every phase | rerank `noul`/`choice` | ★★★★★ |
| 2 | **File/folder scope** — which files are affected | `sdd-explore` "Affected Areas", `sdd-design` "File Changes" | per-candidate `noul` + `choice` | ★★★★☆ |
| 3 | **Skill resolution** — which skills apply | `_shared/skill-resolver.md` Step 2 | `choice` (+`none`) | ★★★ |
| 4 | **Workload forecast** — 400-line risk / chain? | `sdd-tasks` "Review Workload Forecast" | `score`+`noul`+`choice` | ★★★★ |
| 5 | **Ambiguity / ask-human gate** | `sdd-explore`, `sdd-spec` | `noul` | ★★★★ |
| 6 | **Scope-creep guard** — stays in proposal scope? | `sdd-apply` | `noul` | ★★★★ |
| 7 | **Test-impact selection** — which tests to run | `sdd-apply` / CI | rerank `noul` over test files | ★★★★★ |
| 8 | **Failure triage** — root cause / flake vs regression | debugging loop | `choice`+`noul` | ★★★★ |
| 9 | **Acceptance coverage** — spec scenario → test? | `sdd-verify` | `choice`/`noul` per scenario | ★★★★ |
| 10 | **Blast-radius / regression risk** | `sdd-verify`, pre-merge | `score` | ★★★ |
| 11 | **Diff review rubric** (correctness/spec/test-gap/radius) | pre-merge | `score`×N + `noul` | ★★★ |
| 12 | **Verification gate** (claims vs evidence) | `sdd-verify` | `noul`/`choice` (advisory) | ★★★ |
| 13 | **Phase routing** (next SDD phase) | orchestrator DAG | `choice` | ★★ |
| 14 | **Prompt-injection screening** of fetched content | before any tool result enters context | `noul`×N | ★★★ (closed) |

### 3.3 Iteration-2 additions (as useful as "which file to touch")

These are the ones the first pass under-weighted. Ordered by leverage:

1. **Context priming (which memories/docs/skills).** The single highest-leverage
   point *because* it is the token sink AND it is the Engram integration. A reranker
   over (Engram observations + skill compact rules + doc sections) → the minimal
   `state`. ★★★★★
2. **Test-impact selection.** "Which of the N test files exercise this diff?" Rerank
   candidates → run 5 instead of 500. Big wall-clock + tokens win, low risk.
3. **Failure triage.** "Is this failing log a regression, a flake, or an env issue?"
   and "which line is the root cause?" — the classic debugging tax.
4. **Ambiguity + scope-creep gates.** Ask-human when a requirement is ambiguous
   (`noul`, fail-closed); block when the diff leaves proposal scope. Prevents
   building the wrong thing — the most expensive failure mode.
5. **Acceptance-coverage gate.** For every spec scenario, "is there a passing
   covering test?" — makes `sdd-verify` honest without letting a model be the judge.

### 3.4 Do NOT use Jev for

Counting, date math, arithmetic, sorting (stay in code); code/text generation;
being the ground-truth authority (tests are); enforcing hard rules (policy engine);
enacting irreversible actions. **No threshold without calibration; no `choice`
without a fallback option; multi-label = several `noul`; thresholds are per-type
(`noul` absolute ≠ `choice` relative).**

---

## 4. Component architecture

Target tree (evolves the existing `src/lib/system-one/`):

```
src/lib/system-one/
├── provider/
│   ├── types.ts            DecisionProvider, State, QuestionPack, AnswerMap
│   ├── jev.ts              POST /v1/systemone  (TYPESAFE_API_KEY|JEV_API_KEY)
│   ├── openai-decisions.ts POST /v1/decisions  (gpt-6-luna)   [2nd provider]
│   ├── rules.ts            deterministic fallback (exists today)
│   └── registry.ts         provider resolution + circuit breaker (exists today)
├── context/
│   ├── primer.ts           ContextPrimer (Engram + skill-registry + candidates)
│   └── redact.ts           strip secrets/PII from `state`
├── packs/                  one decision recipe per file
│   ├── context-prime.ts    #1  what memories/docs/rules to inject
│   ├── file-scope.ts       #2  affected files/folders
│   ├── skill-route.ts      #3  which skills apply
│   ├── workload-forecast.ts#4  400-line risk / chain
│   ├── ambiguity.ts        #5  ask-human gate (closed)
│   ├── scope-guard.ts      #6  scope-creep (closed)
│   ├── test-impact.ts      #7  which tests to run
│   ├── triage.ts           #8  failure triage
│   ├── acceptance.ts       #9  spec scenario -> test coverage
│   ├── blast-radius.ts     #10 regression risk
│   ├── review.ts           #11 diff rubric
│   ├── verify.ts           #12 claim vs evidence (advisory)
│   └── guard.ts            #14 pre-tool destructive/injection (closed)
├── policy.ts               thresholds + fail posture per label/type (extends
│                           the existing LABEL_DEGRADATION)
├── ledger/
│   ├── shadow.ts           run + log, do NOT change behavior
│   ├── ab.ts               baseline (LLM|rules) vs +Jev
│   └── stats.ts            tokens, turns, wall-clock, $, cost-per-verified-task, wasted
└── index.ts                decideForTurn / decideForPack entry points (exists)

harness/                    (NEW: the reusable dev-harness shipped in-repo)
├── skills/jev-decide/      Agent Skill (Codex .agents/skills, OC .opencode/skills)
├── mcp/                    optional MCP server exposing the packs
├── install.sh              one-command install into an agent
├── config.example.json     provider + pack configuration
└── ONBOARDING.md           human + agent onboarding guide

scripts/
└── onboard.ts              one-command onboarding (see §6)
```

**Invariants (carry the repo's existing rules):** tenant isolation (`tenant_id`
everywhere); fail-closed on protective labels; secrets server-side only
(`setCredential`/`getCredential`); provider-agnostic core; idempotent side effects;
a decision is advisory unless a pack is marked `closed`.

---

## 5. SDD integration map

| SDD moment | Pack invoked | Where it hooks |
|---|---|---|
| Orchestrator before each delegation | `skill-route`, `context-prime` | inject `## Decision Provider` + selected rules alongside the existing `## Project Standards (auto-resolved)` |
| `sdd-explore` | `file-scope`, `ambiguity` | "Affected Areas" + ask-human gate |
| `sdd-design` | `file-scope`, `blast-radius` | "File Changes" table |
| `sdd-tasks` | `workload-forecast` | emit the exact guard lines `Decision needed before apply` / `Chained PRs recommended` |
| `sdd-apply` | `guard`, `scope-guard`, `test-impact` | PreToolUse + which tests to run |
| `sdd-verify` | `acceptance`, `verify`, `triage` | compliance matrix (tests authoritative) |
| every phase | persist decision | `mem_save("sdd/<change>/decisions/<phase>")` |

Everything starts in **shadow** (log only). Packs flip to active per the ledger gate.

---

## 6. One-command onboarding

Goal: a single command takes a fresh clone → runnable product + configured Jev
harness, for anyone (students/community), with graceful degradation when optional
pieces are absent.

```bash
npm run onboard            # interactive; asks what to enable
npm run onboard -- --yes   # non-interactive, safe defaults
```

Flags:

| Flag | Effect |
|---|---|
| `--jev` | write `JEV_API_KEY`/`TYPESAFE_API_KEY`, set `DECISION_ENGINE=jev`, smoke-test one decision |
| `--decisions=openai` | use the OpenAI Decisions provider instead |
| `--meta` | start **Meta Embedded Signup** (see below) |
| `--ycloud` | prompt for `YCLOUD_API_KEY`/`YCLOUD_WEBHOOK_SECRET`/`WHATSAPP_PHONE_NUMBER` |
| `--catalog=path.csv` | seed products/categories from a file |
| `--no-db` | skip migrate/seed (CI/dry runs) |
| `--dry-run` | print the plan, change nothing |

What `onboard.ts` does, in order:

1. **Env**: create `.env.local` from `.env.example` if missing; validate the minimum
   set (`DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, one AI key).
2. **Database**: `npm run db:migrate` (fallback `db:push`) then `npm run db:seed`
   (default tenant + admin + sample catalog).
3. **Decision layer (optional)**: write Jev/OpenAI keys, set `DECISION_ENGINE`, run a
   **dry decision** against a fixture to prove the key works (never print the key).
4. **Messaging provider (optional)**:
   - **YCloud**: store credentials via `setCredential` (encrypted), register the
     `channels` row, print the webhook URL.
   - **Meta Embedded Signup**: open the embedded-signup widget (JS SDK) with the
     app's `config_id`; capture `code` → exchange on `/api/meta/embedded-signup`
     (new route) → discover WABA + `phone_number_id` → subscribe → store the token
     (`/api/meta/connect` already does the OAuth variant; embedded signup reuses the
     same token-discovery + subscribe path). Register the `channels` row.
   - **Chatwoot**: optional; store base_url/token/account id.
5. **Catalog/products (optional)**: import from `--catalog` (or seed the sample set);
   tenant-scoped.
6. **Harness install (optional)**: copy `harness/skills/jev-decide` into the chosen
   agent dir (`.agents/skills`, `.opencode/skills`, `.claude/skills`) and print the
   MCP config snippet.
7. **Verify**: run `npx tsc --noEmit` (fast) and print the remaining manual steps
   (Meta App Review, DNS/HTTPS for webhooks, cron).

Design rules: **idempotent** (safe to re-run), **fail-soft** (a missing provider key
skips that step, never aborts), **never echo secrets**, **`--dry-run` first**.

**Operational reality (do not over-promise):** Meta Embedded Signup requires a Meta
App + a verified business + a public HTTPS callback; YCloud requires a live account.
The command scaffolds and validates; the account-level approvals remain manual and
are printed as a checklist.

---

## 7. Adoption methodology (evidence-gated)

```
1. SHADOW   — packs run, decisions logged, behavior unchanged.
2. MEASURE  — ledger records per pack: calls, latency, tokens in/out, $,
              agreement with ground truth (tests/labels), `wasted` (decisions that
              were supposed to save and did not).
3. A/B      — baseline (rules-only or LLM-only) vs +Jev, N≥3, ≥2 fixture classes.
4. GATE     — activate a pack only if: cost ↓ ≥30%, quality ≥0.95× baseline,
              p95 latency ≤1.2×. Otherwise keep it shadow or drop it.
5. CALIBRATE— tune thresholds on your own labeled data; re-run on model bump
              (pin `jev-1.13.0`; never assume `jev-latest` keeps a threshold's meaning).
6. PUBLISH  — record the ledger result in the repo so the community sees what worked
              and, equally important, what did NOT.
```

Criterion of proof for "Jev in the dev process works": the ledger shows, on this
repo's own tasks, a lower **cost-per-verified-task** and/or fewer **LLM turns** at
**≥0.95× task success**. Report negatives too.

---

## 8. Build plan / progress tracker (for agents)

Work units are reviewable (≤400 changed lines each). Each closes with the repo gate:
`npx tsc --noEmit && npx eslint src && npm run build`. One unit at a time; stop for
review between units.

### Phase 0 — Foundations (provider-neutral)
- [ ] **0.1** `provider/types.ts`: `DecisionProvider`, `State`, `QuestionPack`, `AnswerMap`, error/no-answer shapes.
- [ ] **0.2** `provider/jev.ts`: real contract adapter (`{model,state,questions}→{answers,usage}`), timeout, no retries (breaker owns resilience), never log bodies.
- [ ] **0.3** `provider/openai-decisions.ts`: `{model,input,questions}→{answers}`; map `predicate↔noul`; handle `refusal`.
- [ ] **0.4** `provider/registry.ts`: extend existing to select jev|openai|rules, per-tenant + env precedence.
- [ ] **0.5** Tests for adapters with injected `fetch` (fixtures from the real contract).

### Phase 1 — ContextPrimer (Engram-aware)
- [ ] **1.1** `context/primer.ts`: `build(packId, task)` → top-k memories (`mem_search`+`mem_get_observation`), skill compact rules, candidate list; token budget.
- [ ] **1.2** `context/redact.ts`: strip secrets/PII from `state`.
- [ ] **1.3** Tests: primer trims to budget; never includes denied fields.

### Phase 2 — Packs (one file each, pure + testable)
- [ ] **2.1** `context-prime` (#1) — highest leverage.
- [ ] **2.2** `file-scope` (#2) — per-candidate `noul` rerank + folder `choice` + `covered` anti-forced-winner.
- [ ] **2.3** `test-impact` (#7).
- [ ] **2.4** `workload-forecast` (#4) — emits the exact guard lines.
- [ ] **2.5** `guard` (#14, closed) + `scope-guard` (#6) + `ambiguity` (#5).
- [ ] **2.6** `triage` (#8), `acceptance` (#9), `blast-radius` (#10), `review` (#11), `verify` (#12).
- [ ] **2.7** `skill-route` (#3), `phase-route` (#13).
- [ ] **2.8** Each pack ships its `questions` + `thresholds` in one place and a fixture test.

### Phase 3 — Policy + eval
- [ ] **3.1** `policy.ts`: thresholds per label/type, fail posture (extends `LABEL_DEGRADATION`).
- [ ] **3.2** Golden fixtures (labelled) for `file-scope`, `workload-forecast`, `guard`.

### Phase 4 — Ledger (measurement)
- [ ] **4.1** `ledger/shadow.ts`: run + log, no behavior change.
- [ ] **4.2** `ledger/ab.ts`: baseline vs +Jev harness with metrics (cost-per-verified-task, turns, tokens, `wasted`).
- [ ] **4.3** `ledger/stats.ts`: report + `npm run jev:report`.

### Phase 5 — SDD integration
- [ ] **5.1** Orchestrator injects `## Decision Provider`; skill resolution consults `skill-route` in shadow.
- [ ] **5.2** Wire packs into `sdd-explore/design/tasks/apply/verify` (shadow).
- [ ] **5.3** Persist each decision to Engram (`sdd/<change>/decisions/<phase>`).

### Phase 6 — Dev-harness packaging (in-repo)
- [ ] **6.1** `harness/skills/jev-decide/SKILL.md` (teaches when to call each pack).
- [ ] **6.2** `harness/mcp/` optional MCP server exposing the packs as tools.
- [ ] **6.3** `harness/install.sh` + `config.example.json`.
- [ ] **6.4** `harness/ONBOARDING.md`.

### Phase 7 — One-command onboarding
- [ ] **7.1** `scripts/onboard.ts` (env + db + decision smoke-test), `--dry-run`, idempotent.
- [ ] **7.2** `--ycloud` credential + channel registration.
- [ ] **7.3** `--meta`: `/api/meta/embedded-signup` route + widget wiring (reuses `/api/meta/connect` discovery+subscribe).
- [ ] **7.4** `--catalog` import.
- [ ] **7.5** Harness install step + final checklist output.

### Phase 8 — Docs + community
- [ ] **8.1** `docs/jev-harness.md` + README section + AGENTS.md pointer.
- [ ] **8.2** Publish the ledger results (what worked, what did not).

---

## 9. Acceptance criteria & verification

- Gate stays green: `npx tsc --noEmit` · `npx eslint src` · `npm run build`.
- Tenant isolation intact (every new query is `tenant_id`-scoped).
- Secrets never logged, never returned to the client; `state` redacted.
- Adapters fail **closed** on anomalies; the registry falls back to `rules`.
- Shadow mode changes **no** behavior until a pack passes the ledger gate.
- A pack's questions + thresholds live in one file and have a fixture test.
- `onboard --dry-run` makes no changes; running it twice is safe.

---

## 10. Risks & limits (from the research — keep honest)

- **Jev is not deterministic and not a truth oracle.** Independent audits found: last
  of 12 on LegalBench; 96.9% of per-option probabilities exactly 0 in one banking
  set; 50 identical requests → 15 different answers; ~6.3× (not 40–200×) faster in
  one benchmark. **Treat probabilities as scores; calibrate on your data.**
- **Some ablations show the Jev signal adds nothing over retrieval/rules** — hence
  the mandatory rules baseline and the `wasted` metric.
- **Small/chunked states can cost MORE** (one ledger saw a reduce pattern at −523%).
- **Type-safety ≠ injection resistance** (TypeSafe's own docs + one study).
- **Ecosystem noise:** much of the Jev blogosphere is AI-written SEO; only
  `docs.typesafe.ai` is first-party. Cite primary sources.
- **Multi-tenant privacy:** Engram is project-scoped; the product's memory must stay
  tenant-scoped (`knowledge_chunks`). Never leak across tenants via `state`.

---

## 11. References

- TypeSafe: `docs.typesafe.ai/api`, `docs.typesafe.ai/models`, `docs.typesafe.ai/llms.txt`
- OpenAI: GPT-6 Sol/Luna announcement; `/v1/decisions` guide; AI Gateway decisions
- Harnesses: `minhgv/jev-mcp`, `@jkudish/jev-mcp`, `TranBaVinhSon/jev-harness`, `leepokai/jev-guard`, `lazniak/jevskill`, `chr-kelly/jev-cookbook`
- Benchmarks: `tawfeks/decisionkit`, `gemanor/jev-code-review-benchmark`, `danielgshea/jev-as-a-judge`
- This repo: `docs/agent-platform.md`, `docs/providers.md`, `docs/channels-meta.md`, `docs/deployment.md`, `src/lib/system-one/`, `AGENTS.md`

---

## 12. Execution & delegation policy (multi-agent, waves)

### 12.1 Memory provider — Engram, three switchable backends

The memory layer **IS Engram**: one `MemoryProvider` interface; the only choice is
**where the memories live**, switchable by env `JEV_MEMORY` with **no code change**:

| `JEV_MEMORY` | Backend | Config |
|---|---|---|
| `local` (alias `engram`) | **Local Engram** server — default | `ENGRAM_HTTP_URL` (default `http://127.0.0.1:7437`) |
| `cloud` | **Cloud Engram** (remote server) | `ENGRAM_CLOUD_URL` + `ENGRAM_CLOUD_TOKEN` |
| `neon` | **Engram-on-Neon** — memories in the app's Postgres table `jen_memory` | `DATABASE_URL` |
| `none` | fail-soft degraded fallback (stateless) — **not** a backend | — |

`local` and `cloud` are the same HTTP provider with a different base URL/token;
`neon` is interface-identical and backed by Postgres. All three are backend-agnostic
for the `ContextPrimer` (§2) and every pack.

```ts
interface MemoryProvider {
  search(query: string, opts?: { project?: string; limit?: number }): Promise<MemRef[]>;
  get(id: string): Promise<string>;              // full content (never the preview)
  save(input: { title: string; topicKey: string; type: string; content: string }): Promise<string>;
  context(opts?: { project?: string }): Promise<string>; // recent session context
}
```

**No tenant in harness mode:** `jen_memory.tenant_id` is **nullable** — with it
`null`, the harness runs in a harness/global scope (no tenant required); the product
always sets it (isolation law unchanged for tenant data). Delivered by migration
`0006` (`tenant_id` DROP NOT NULL + harness-scope index). The harness calls whichever
backend is configured (local / cloud / neon) through this single interface.

**Shipped by the foundation:** `context/memory/{engram,neon,none,registry}.ts` +
`jenMemory` table (migration `0005`). This section (three modes + nullable tenant) is
an amendment delivered in its own worktree (`jev-harness-memory-scope`).

### 12.2 Test gate — mandatory, automatic, before every commit

The real gate for this repo (from `AGENTS.md`) plus any tests a phase adds:

```bash
npx tsc --noEmit && npx eslint src && npm run build
# plus the phase's own tests (node:test via tsx, or the runner the phase adds)
```

- A phase is **done** only when the gate is **fully green**.
- **A commit is created automatically ONLY when the gate passes.** No green gate → no
  commit → the delegate reports `blocked`.
- Never `--no-verify`. Never commit red. Never add AI attribution.
- Conventional commits in English: `feat(jev-provider):`, `test(jev-provider):`, etc.

### 12.3 Wave orchestration (phases are dependent — not all parallel)

Worktrees base on `origin/main`; a dependent phase cannot be built before its base
exists on main. Therefore:

| Wave | Scope | Worktree(s) |
|---|---|---|
| 1 | **Phase 0 + 1** (foundation: provider + ContextPrimer) | `feat/jev-harness-foundation` |
| — | merge foundation → main (orchestrator) | — |
| 2 | Phase 2 (packs, separate files → parallel), Phase 4 (ledger), Phase 6 (harness), Phase 8 (docs) | 4 worktrees |
| 3 | Phase 3 (policy/eval), Phase 5 (SDD integration), Phase 7 (onboarding) | 3 worktrees |

Merges are done by the orchestrator, one at a time, `--no-ff`, in dependency order.

### 12.4 Delegate contract

Every delegate is launched via `opencode -m deepseek/deepseek-flash` inside its Orca
worktree, and its brief MUST include: read this plan + `AGENTS.md` first; run the SDD
workflow (persist artifacts to Engram); implement the phase; run the gate (§12.2);
commit only if green; save progress to Engram `sdd/jev-harness/<phase>/apply-progress`;
report commits, files, gate output, blockers.
