# JEV Harness

A reusable, **provider-neutral decision layer** that plugs into this repo's
coding-agent workflow and ships in-repo so anyone can use it with a single
`JEV_API_KEY`.

> **Code owns the workflow; Jev owns the bounded semantic decision; the LLM owns
> generation; Engram gives every decision memory.**

The harness takes a `state` (text/JSON) plus a set of typed `questions` and
returns **typed probabilistic `answers`** — no generated text. It cannot emit an
invalid type, and it is far cheaper and faster than a frontier LLM call on
bounded decisions. It is **not deterministic** and **not a truth oracle**: it
returns calibrated probabilities, and the determinism lives in the surrounding
threshold/policy code. Read [the honest caveats](#honest-caveats) before you
trust a number.

This document is the canonical reference. The full design rationale lives in
[`../JEV-HARNESS-PLAN.md`](../JEV-HARNESS-PLAN.md). The measurement methodology
and the negative results live in [`jev-harness-ledger.md`](jev-harness-ledger.md).

---

## 1. What the harness is

Four actors, four responsibilities:

| Actor | Owns |
|---|---|
| **Code** | The workflow, thresholds, fail posture, and every irreversible action. |
| **Jev** (or **OpenAI Decisions**) | A *bounded* semantic decision: a probability, a pick, or a rubric position. Nothing else. |
| **The LLM** | Generation — code, prose, tool calls. |
| **Engram** | Memory: context in (`state`), decisions out (audit trail, eval set). |

The harness is the glue: a **provider-neutral contract**, a **context primer**
that assembles `state` from memory, a **catalog of decision packs**, a **policy**
registry for thresholds and posture, and a **ledger** to measure whether any of
it earns its keep.

### Where it lives

```
src/lib/system-one/
├── provider/            provider-neutral transport + adapters
│   ├── types.ts         DecisionProvider, State, QuestionPack, AnswerMap, NoAnswer
│   ├── jev.ts           POST /v1/systemone       (Jev / TypeSafe System One)
│   ├── openai-decisions.ts  POST /v1/decisions   (2nd provider)
│   ├── rules.ts         deterministic, offline fallback
│   └── registry.ts      provider resolution + circuit breaker + rules fallback
├── context/
│   ├── primer.ts        ContextPrimer — assembles + redacts + budgets `state`
│   ├── redact.ts        strip secrets/PII from `state`
│   └── memory/          MemoryProvider backends (engram/cloud/neon/none)
├── packs/               one decision recipe per file (14 packs)
├── policy.ts            the single source of truth for thresholds + fail posture
├── ledger/              shadow, A/B, stats — MEASUREMENT ONLY
├── eval/                golden fixtures + runner (offline threshold calibration)
└── harness/            SDD integration (decision-provider block, shadow runner)

harness/                 the reusable dev-harness shipped in-repo
├── skills/jev-decide/   Agent Skill — when to call each pack
├── mcp/                 optional stdio MCP server exposing the packs as tools
├── sdd/                 opt-in SDD wiring (emit block, shadow CLI, patches)
├── install.sh           copy the skill into an agent's skills dir
├── config.example.json  provider + memory + packs configuration
└── ONBOARDING.md        human + agent onboarding

scripts/onboard.ts       one-command onboarding (npm run onboard)
scripts/jev-report.ts    npm run jev:report — ledger report (offline A/B or --in)
```

> There are **two decision layers** in `src/lib/system-one/`. The per-turn
> `DecisionLayer` (`index.ts` → `decideForTurn`, `registry.ts`, `config.ts`) is
> the WhatsApp/voice *runtime* semantic decision. The **provider-neutral
> transport** in `provider/` (used by every pack) is what *this* document
> describes. They share the name "System One" but are different contracts.

---

## 2. The provider-neutral decision layer

### 2.1 The contract

```ts
interface DecisionProvider {
  readonly name: string; // "jev" | "openai-decisions" | "rules"
  decide<T extends QuestionPack>(
    state: State,
    questions: T,
    opts?: { model?: string; timeoutMs?: number },
  ): Promise<AnswerMap<T>>;
}
```

- `State` is arbitrary text/JSON (`string | object | array`). **Text only** — no
  images in this contract.
- `QuestionPack` is a map of `id → Question`. **Question ids are local keys**
  used to correlate answers; the hosted APIs never send the id to the model, so
  all meaning must live in the question's `instructions`/`criteria`.
- `AnswerMap<T>` is typed by the question: a `noul` question yields a
  `NoulAnswer`, and so on. A provider that declines yields an explicit
  `NoAnswer` (`{ type: "no-answer", reason }`).

### 2.2 The three primitives

| Primitive | Meaning | Threshold semantics |
|---|---|---|
| `noul` | Probability of yes, **absolute** (`0..1`) | Cutoff directly on the probability |
| `choice` | Pick **one** of ≤255 options (relative) | Margin/confidence floor, not an absolute probability |
| `score` | Position on an ordered 2–10 level rubric | An index into the pack's `criteria` array |

Multi-label decisions are several `noul` questions, never one `choice`. Every
`choice` declares a fallback option (e.g. `none`, `other`). Thresholds are
**per-type**: a `noul` absolute cutoff is never reused as a `choice` margin.

### 2.3 The Jev adapter (`provider/jev.ts`)

```
POST {baseUrl}/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY   (alias: $JEV_API_KEY)
{ model, state, questions } → { model, answers, usage }
```

- Default base URL `https://api.typesafe.ai`, default model `jev-latest`,
  default timeout 8 000 ms (`JEV_BASE_URL`, `JEV_MODEL`).
- **Zero retries** — the registry's circuit breaker + rules fallback own
  resilience, not the adapter.
- The adapter throws a typed `DecisionProviderError` on **every** anomaly
  (non-2xx, bad JSON, a malformed or missing answer). That throw *is* the
  registry's fallback trigger.
- Request/response bodies are never logged (they carry the caller's `state`).

### 2.4 The OpenAI Decisions adapter (`provider/openai-decisions.ts`)

```
POST {baseUrl}/v1/decisions
Authorization: Bearer $OPENAI_API_KEY
{ model, input, questions: [ { type, name, instructions, choices|levels } ] }
→ { answers: [ { name, ... } ] }        // or a top-level `refusal`
```

- Default base URL `https://api.openai.com/v1`, default model `gpt-6-luna`,
  default timeout 20 000 ms (`OPENAI_DECISIONS_BASE_URL`, `OPENAI_DECISIONS_MODEL`).
- Type mapping: `noul ↔ predicate` (a boolean maps to `noul ∈ {0,1}`), `choice ↔
  choice`, `score ↔ score`.
- A `refusal` is a **first-class outcome**, not an error — it becomes a
  `NoAnswer` so policy can route to review/human.
- **No documented calibration contract** → treat its numbers as scores and
  threshold on your own data.

### 2.5 Provider resolution + the rules fallback (`provider/registry.ts`)

`resolveDecisionProvider()` is pure and synchronous. Precedence:

```
explicit config  →  env (DECISION_PROVIDER, then DECISION_ENGINE)  →  rules
```

- A network provider with **no resolvable key** degrades to `rules`.
- Every network call runs behind the shared **circuit breaker** (threshold 3,
  reset 60 s). Any thrown anomaly (timeout, 5xx, malformed body, open breaker)
  falls straight through to the `rules` provider — a decision must never block
  the caller on a provider outage.
- `rules` never touches the network and emits explicit no-answers.

---

## 3. Memory backends

The **memory layer is Engram**; the only choice is *where the memories live*.
A single `MemoryProvider` interface keeps it backend-agnostic:

```ts
interface MemoryProvider {
  readonly name: string;
  search(query: string, opts?): Promise<MemRef[]>; // previews only
  get(id: string): Promise<string>;                // full content — never the preview
  save(input): Promise<string>;                    // persist an observation; returns id
  context(opts?): Promise<string>;                 // recent-session context blob
}
```

Switch backends with **no code change** via `JEV_MEMORY`:

| `JEV_MEMORY` | Backend | Config |
|---|---|---|
| `local` (alias `engram`) — **default** | Local Engram server | `ENGRAM_HTTP_URL` (default `http://127.0.0.1:7437`), `ENGRAM_HTTP_TOKEN` |
| `cloud` | Remote Engram server | `ENGRAM_CLOUD_URL` + `ENGRAM_CLOUD_TOKEN` |
| `neon` | Engram-on-Postgres: the app's `jen_memory` table | `DATABASE_URL` |
| `none` | Stateless degraded fallback — **not** a backend | — |

- `local` and `cloud` are the same HTTP provider with a different base
  URL/token; `neon` is interface-identical and backed by Postgres.
- Memory is **advisory**: an unavailable backend must never block a decision.
  Every implementation **fails soft** (empty result), not closed.

### 3.1 Nullable tenant in harness mode

The `jen_memory` table (`src/db/schema.ts`) is scoped by **both** `tenant_id`
and `project`. Migration `0005` created it; migration `0006` made `tenant_id`
**nullable** so the *dev harness* can run with no tenant:

- A numeric `tenantId` scopes the query to `tenant_id = $n` (the product always
  sets it — tenant isolation is law).
- A `null` tenantId scopes to `tenant_id IS NULL` — the **harness/global** rows.

The provider **never runs an unscoped query**, so product rows (which always
carry a `tenant_id`) can never leak into the harness, and vice versa.

> **Prod vs. dev memory:** Engram (project-scoped) is *developer* memory. The
> product's tenant memory is `knowledge_chunks` on pgvector, `tenant_id`-scoped.
> Never cross them, and never let one leak into the other through `state`.

---

## 4. The ContextPrimer

Before a pack decides, the primer assembles the `state` that will be sent to the
provider (`context/primer.ts`):

```
build(packId, input):
  1. search memory for each query (top-k, default 5 per query)
  2. get(id) for FULL content  — Engram previews are only ~300 chars
  3. attach compact skill/registry rules
  4. attach candidate files/folders (paths + snippets only)
  5. redact secrets/PII, then trim everything to a token budget (default 8 000)
```

Design rules: retrieve **top-k curated, never dump** (state is billed on every
call); **always `get` for full content**; **no secrets/PII** (state may leave the
process to a hosted API); deterministic assembly so a decision is replayable.

---

## 5. The packs catalog

Every pack is a pure recipe: typed `questions` + numeric `thresholds` in the
**same file**, plus a `run(input, runtime)` that primes state, asks the provider,
and maps typed answers to a deterministic `PackResult`. Thresholds are read from
the central policy registry (`policy.ts`), so calibration is one edit in one
place.

**Fail posture:** an `open` pack is *advisory* (no signal → proceed); a `closed`
pack is *protective* (no signal → do not proceed / ask a human). No pack is
active until the [ledger gate](#8-adoption-methodology) promotes it.

| Pack | Decision | Question types | Posture | Call it when |
|---|---|---|---|---|
| `context-prime` | which candidates (memory/docs/rules) enter `state` | `noul` ×N — `coverage` + per-candidate `select_` | open | before every phase; you need minimal sufficient context |
| `file-scope` | which files/folders are affected | `choice` (`folder`) + `noul` (`covered`) + per-file `noul` | open | `sdd-explore` "Affected Areas", `sdd-design` "File Changes" |
| `skill-route` | which skills apply | `choice` (`skill`, +`none`) + per-candidate `noul` | open | orchestrator, before delegating |
| `workload-forecast` | is the change >400 lines / needs chaining? | `score` (`size`) + `noul` (`chained`, `decisionNeeded`) | open | `sdd-tasks` "Review Workload Forecast" |
| `ambiguity` | is the requirement ambiguous? | `noul` (`ambiguous`, `missingInfo`, `contradictory`) | **closed** | `sdd-explore`, `sdd-spec` — before building the wrong thing |
| `scope-guard` | does the diff leave proposal scope? | `noul` (`inScope`, `newPaths`, `unrelated`) | **closed** | `sdd-apply` before mutating |
| `test-impact` | which tests exercise this diff? | `noul` (`test`, `regression`) | open | `sdd-apply` / CI — run 5 instead of 500 |
| `triage` | regression, flake, or env? | `choice` (`cause`) + `noul` (`blocking`, `rerunnable`) | open | any debugging loop |
| `acceptance` | is each spec scenario covered by a test? | `noul` (`scenario`, `complete`) | open | `sdd-verify` (tests are authoritative) |
| `blast-radius` | regression risk of the change | `score` (`radiusWarn`) + `noul` (`dependents`, `publicApi`) | open | `sdd-verify`, pre-merge |
| `review` | diff rubric | `noul` (`blocking`) + `score` (`weakScore`) | open | pre-merge review |
| `verify` | claims backed by evidence? | `noul` (`evidence`, `matches`) + `choice` (`verdict`) | open (advisory) | `sdd-verify` |
| `phase-route` | next SDD phase | `choice` (phase) + `noul` (`ready`, `blocked`) | open | orchestrator DAG |
| `guard` | destructive / injection / secret-exposure? | `noul` (`injection`, `destructive`, `exfiltration`, `irreversible`) | **closed** | before any tool result enters context or any mutation |

`workload-forecast` emits the exact guard lines the SDD tasks phase matches
literally: **`Decision needed before apply`** and **`Chained PRs recommended`**.

### Which Jev question type to reach for

- Something is a yes/no judgment → **`noul`**. Never a `choice` with two options.
- Pick one of a fixed, small option set → **`choice`** (with a `none`/`other`
  fallback). Never to select from hundreds.
- Graduated "how big / how risky / how complete" → **`score`** with an ordered
  rubric.
- Several independent labels → **several `noul`**, one per label.

### Do NOT use a pack for

Counting, date math, arithmetic, sorting (stay in code); code/text generation;
being the ground-truth authority (tests are); enforcing hard rules (the policy
engine); enacting irreversible actions. **No threshold without calibration; no
`choice` without a fallback; multi-label means several `noul`; thresholds are
per-type.**

---

## 6. Policy: thresholds + fail posture (`policy.ts`)

`policy.ts` is the **single source of truth** for every harness threshold, keyed
by label and typed by kind. Two invariants are structural:

1. **Kind is part of the lookup.** `noul`, `choice` and `score` live in three
   separate maps behind three accessors (`noulThreshold`, `choiceMargin`,
   `scoreThreshold`). A `noul` cutoff is never reused as a `choice` margin.
2. **A missing threshold fails closed.** An unknown label or key throws
   `PolicyError` — never a silent permissive default.

Fail posture extends the per-turn `LABEL_DEGRADATION` registry: `postureOf(label)`
consults the harness registry first, then `labelDegradation`, and an
unregistered label fails **closed**. The three `closed` packs are `ambiguity`,
`scope-guard`, and `guard`.

---

## 7. SDD integration

The harness plugs into the local SDD coding-agent flow as an **opt-in,
shadow-only** layer. With `JEV_HARNESS_SDD` unset (or `0`):

- the orchestrator injects **nothing** (`harness/sdd/emit-decision-provider.mts`
  prints nothing),
- the phase CLIs **no-op**,
- no pack runs, no decision is persisted.

Set `JEV_HARNESS_SDD=1` to enable it — even then it runs in **shadow** (observe +
log only).

### 7.1 The `## Decision Provider` block

The orchestrator injects a `## Decision Provider (auto-resolved)` block into
every delegated sub-agent, right after the existing `## Project Standards
(auto-resolved)` block:

```
npx tsx harness/sdd/emit-decision-provider.mts    # prints the block, or nothing
```

It carries the engine, base URL, model, timeout, pack list, the decision topic
key, and the key **presence** — **never the key value**. The value never leaves
the process through this path.

### 7.2 The shadow runner

```ts
provider = resolveDecisionProvider({ env })   // config → env → rules (breaker)
memory   = getMemoryProvider({ project })      // JEV_MEMORY: engram | neon | none
primer   = createContextPrimer(memory)
runner   = createShadowRunner({ provider, primer, memory })

await runner.run(packId, { task, candidates }, { change, phase })
// → measures every provider call (DecisionSample, mode "shadow")
// → persists { acted: false, mode: "shadow", result, samples } to memory
// → returns; NOTHING is blocked, redirected or mutated
```

`payload.acted` is **always `false`** — the runner never reads `result.allow` as
an instruction. A provider outage is isolated (the sample records the error,
nothing throws). A memory failure yields `persistedId: null` and never blocks the
phase.

### 7.3 Hook map (plan §5)

| SDD moment | Packs (shadow) | Hook / artifact |
|---|---|---|
| Orchestrator, before each delegation | `skill-route`, `context-prime` | inject the `## Decision Provider` block + selected context |
| `sdd-explore` | `file-scope`, `ambiguity` | "Affected Areas" + ask-human signal |
| `sdd-design` | `file-scope`, `blast-radius` | "File Changes" table |
| `sdd-tasks` | `workload-forecast` | the exact guard lines |
| `sdd-apply` | `guard`, `scope-guard`, `test-impact` | PreToolUse + which tests to run |
| `sdd-verify` | `acceptance`, `verify`, `triage` | compliance matrix (tests authoritative) |
| every phase | — | persist the decision to memory |

Run a phase's packs once, observe-only:

```bash
JEV_HARNESS_SDD=1 npx tsx harness/sdd/shadow-wiring.mts \
  --change <change-name> --phase <explore|design|tasks|apply|verify> \
  [--task "<one-line task>"] [--candidates path/a.ts,path/b.ts]
```

### 7.4 Persistence convention

Every decision is saved under the change's decision namespace:

```
topic_key: sdd/<change-name>/decisions/<phase>
type:      discovery
content:   { change, phase, packId, mode:"shadow", acted:false, provider,
             posture, allow, degraded, reason, tokens, value, samples[], at }
```

Retrieve with the standard two-step rule (previews are 300 chars):

```
mem_search(query: "sdd/<change-name>/decisions/<phase>", project: "{project}")
mem_get_observation(id: <id>)   # full JSON
```

These decisions double as an **eval set**: replay the same `state` against new
models/thresholds to calibrate the gate.

The copy-pasteable per-skill patches (orchestrator, explore, design, tasks,
apply, verify) and the full wiring are in [`harness/sdd/integration.md`](../harness/sdd/integration.md).

---

## 8. Onboarding

### 8.1 One command: `npm run onboard`

Takes a fresh clone → runnable product + configured harness, fail-soft:

```bash
npm run onboard            # interactive; asks what to enable
npm run onboard -- --yes   # non-interactive, safe defaults
npm run onboard -- --dry-run
```

| Flag | Effect |
|---|---|
| `--jev` | persist `JEV_API_KEY` + `DECISION_ENGINE=jev`; smoke-test one decision |
| `--decisions=openai` | use the OpenAI Decisions provider instead |
| `--meta` | scaffold **Meta Embedded Signup** (account approvals stay manual) |
| `--ycloud` | store `YCLOUD_*`/`WHATSAPP_PHONE_NUMBER` credentials + register the channel |
| `--catalog=<path.csv>` | seed products/categories (tenant-scoped) |
| `--no-db` | skip migrate/seed (CI/dry runs) |
| `--dry-run` | print the plan, change nothing |
| `--agent=<name>` | install the skill into `codex` \| `opencode` \| `claude` |
| `-h, --help` | show help |

It is **idempotent** (safe to re-run), **fail-soft** (a missing key skips that
step), **secret-safe** (keys are never printed), and **`--dry-run` first**. Steps
in order: env bootstrap → database (migrate/seed) → decision layer (write keys +
smoke-test) → YCloud → Meta → catalog → harness install (skill) → manual
checklist.

### 8.2 Getting a `JEV_API_KEY`

1. Create a TypeSafe account and generate an API key at
   [docs.typesafe.ai](https://docs.typesafe.ai).
2. Put it in `.env.local` as `JEV_API_KEY` **or** `TYPESAFE_API_KEY` (both are
   accepted; `JEV_API_KEY` wins).
3. Set the engine: `DECISION_ENGINE=jev` (or just run `npm run onboard -- --jev`,
   which writes it and smoke-tests one decision without ever printing the key).

Without any key the harness still runs — `DECISION_ENGINE=rules` answers offline
with explicit no-answers, which is enough to wire everything up first.

### 8.3 Using OpenAI Decisions instead

Set `DECISION_ENGINE=openai-decisions` (or run
`npm run onboard -- --decisions=openai`) and provide `OPENAI_API_KEY`. Optional
overrides: `OPENAI_DECISIONS_BASE_URL`, `OPENAI_DECISIONS_MODEL`. The
adapter maps `predicate ↔ noul` and turns a `refusal` into a `NoAnswer`.

### 8.4 Manual steps (cannot be automated)

`onboard` validates and scaffolds; these remain human:

- **Meta App Review** + a verified business (Embedded Signup / Cloud API).
- A **public HTTPS** `BASE_URL` for the OAuth redirect and webhook callbacks.
- Rotate `ADMIN_PASSWORD`; store provider keys in the DB.
- Schedule `POST /api/cron/flush` every minute.

See [`meta-embedded-signup.md`](meta-embedded-signup.md) and
[`harness/ONBOARDING.md`](../harness/ONBOARDING.md).

### 8.5 Use it from an agent (skill + MCP)

Two surfaces, same packs:

- **Agent Skill** — `harness/skills/jev-decide/SKILL.md`: *when* to call each
  pack. Install with `bash harness/install.sh --agent opencode` (or `codex` |
  `claude`), or let `npm run onboard -- --agent=opencode` do it.
- **MCP server** — `harness/mcp/`: exposes one tool per pack (`jev_file_scope`,
  `jev_guard`, …) plus `jev_decide`. Register it in `opencode.json`, codex, or
  Claude Code; see [`harness/mcp/README.md`](../harness/mcp/README.md).

The in-repo TypeScript source of truth is `src/lib/system-one/`; the skill and
MCP catalog mirror it. Keep them in sync.

**Quickstart:**

```bash
npm install
npm run onboard -- --jev --yes        # env + db + decision smoke-test + skill
npx tsc --noEmit && npx eslint src && npm test && npm run build
```

---

## 9. Adoption methodology

Adoption is **shadow-first and evidence-gated**. No behavior changes until the
ledger proves a pack earns its keep.

```
1. SHADOW    packs run, decisions logged, behavior unchanged.
2. MEASURE   the ledger records per pack: calls, latency, tokens in/out, $,
             agreement with ground truth (tests/labels), and `wasted`
             (decisions meant to save work that did not).
3. A/B       baseline (rules-only or LLM-only) vs +Jev, N≥3, ≥2 fixture classes.
4. GATE      activate a pack only if: cost ↓ ≥30%, quality ≥0.95× baseline,
             p95 latency ≤1.2×. Otherwise keep it shadow or drop it.
5. CALIBRATE tune thresholds on your own labeled data; re-run on a model bump
             (pin an exact model version — never assume a threshold keeps its
             meaning across `latest`).
6. PUBLISH   record the ledger result in the repo so the community sees what
             worked — and, equally important, what did NOT.
```

The criterion of proof: on this repo's own tasks, a lower
**cost-per-verified-task** and/or fewer **LLM turns** at **≥0.95× task success**.
Report negatives too.

The measurement machinery (shadow ledger, A/B, stats, the gate, golden eval) and
the honest results are documented in [`jev-harness-ledger.md`](jev-harness-ledger.md).

---

## 10. Honest caveats

Read these before trusting a probability.

- **Jev is not deterministic and not a truth oracle.** Independent audits found
  it last of 12 on LegalBench; 96.9% of per-option probabilities exactly 0 in one
  banking set; 50 identical requests yielding 15 different answers; ~6.3× (not
  40–200×) faster in one benchmark. **Treat probabilities as scores; calibrate
  on your data.**
- **Some ablations show the Jev signal adds nothing over retrieval/rules** —
  hence the mandatory rules baseline and the `wasted` metric.
- **Small/chunked states can cost MORE.** One ledger observed a reduce pattern
  at −523% (i.e. it *increased* cost).
- **Type-safety ≠ injection resistance.** A provider cannot emit an invalid
  *type*; that says nothing about whether hostile content can steer it.
- **Ecosystem noise.** Much of the Jev blogosphere is AI-written SEO. Only
  `docs.typesafe.ai` is first-party — cite primary sources.
- **Multi-tenant privacy.** Engram is *project-scoped developer* memory. The
  product's memory must stay tenant-scoped (`knowledge_chunks`). Never leak
  across tenants via `state`, and never let harness memory collide with product
  memory.
- **Thresholds ship uncalibrated.** The defaults in `policy.ts` are starting
  points, not tuned values.

Full detail in [`jev-harness-ledger.md`](jev-harness-ledger.md) §4.

---

## 11. References

- Plan (design + phases): [`../JEV-HARNESS-PLAN.md`](../JEV-HARNESS-PLAN.md).
- Ledger + caveats: [`jev-harness-ledger.md`](jev-harness-ledger.md).
- Onboarding (human + agent): [`../harness/ONBOARDING.md`](../harness/ONBOARDING.md).
- SDD integration + patches: [`../harness/sdd/integration.md`](../harness/sdd/integration.md).
- MCP server: [`../harness/mcp/README.md`](../harness/mcp/README.md).
- Agent Skill: [`../harness/skills/jev-decide/SKILL.md`](../harness/skills/jev-decide/SKILL.md).
- TypeSafe (Jev): `docs.typesafe.ai` — the only first-party source.
- Related docs: [`agent-platform.md`](agent-platform.md) (System One in the
  product), [`providers.md`](providers.md), [`security.md`](security.md).
