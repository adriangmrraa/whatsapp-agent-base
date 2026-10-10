# SDD integration — JEV harness (Phase 5)

How the JEV decision harness plugs into the local SDD coding-agent flow:
**code owns the workflow; Jev owns the bounded decision; the LLM owns
generation; Engram gives every decision an audit trail.**

Everything here is **opt-in**. With `JEV_HARNESS_SDD` unset:

- the orchestrator injects **nothing** (`emit-decision-provider.mts` prints
  nothing),
- the phase CLIs **no-op**,
- no pack runs, no decision is persisted.

Set `JEV_HARNESS_SDD=1` to enable it — and even then it runs in **shadow**
(observe + log only, plan §7). Nothing changes behavior until the ledger gate
promotes a pack.

> The user's global SDD skills live at `~/.config/opencode/skills` and are
> **out of scope** for this repo. The patches below are copy-pasteable; a human
> (or the orchestrator) applies them on their machine. This repo only ships the
> helper, the shadow sample and this map.

---

## 1. Injection model — two adjacent blocks

The orchestrator already injects one provenance block into every delegated
sub-agent: `## Project Standards (auto-resolved)` (`_shared/skill-resolver.md`
Step 3). The harness adds a **second block right after it**:

```
## Project Standards (auto-resolved)      ← existing (skill registry)
{paste compact rules}

## Decision Provider (auto-resolved)       ← NEW (JEV harness, opt-in)
- engine: `jev`
- base_url: `https://api.typesafe.ai`
- model: `jev-latest`
- api_key: present (JEV_API_KEY; value is never printed/…)
- packs: `context-prime`, `file-scope`, … `guard`
- persist decisions to: `sdd/<change>/decisions/<phase>`
- posture: shadow (advisory); promote per the ledger gate
```

Rules the block encodes (do not relax them):

1. **Shadow only.** Run the pack, log the decision, persist it. Do **not**
   branch on `decision.allow` until the ledger gate promotes the pack.
2. **Never render the key.** The block carries base URL + key *presence* +
   the var *name*; the value never leaves the process.
3. **`[closed]` packs** (`ambiguity`, `scope-guard`, `guard`) fail closed **only
   when active** — in shadow they are advisory.

Emit it with the shipped helper:

```bash
npx tsx harness/sdd/emit-decision-provider.mts    # prints the block, or nothing
```

---

## 2. Hook map (plan §5)

| SDD moment | Packs (shadow) | Hook / artifact |
|---|---|---|
| Orchestrator, before each delegation | `skill-route`, `context-prime` | inject `## Decision Provider` + selected skill/context |
| `sdd-explore` | `file-scope`, `ambiguity` | "Affected Areas" + ask-human signal |
| `sdd-design` | `file-scope`, `blast-radius` | "File Changes" table |
| `sdd-tasks` | `workload-forecast` | the exact guard lines `Decision needed before apply` / `Chained PRs recommended` |
| `sdd-apply` | `guard`, `scope-guard`, `test-impact` | PreToolUse + which tests to run |
| `sdd-verify` | `acceptance`, `verify`, `triage` | compliance matrix (tests authoritative) |
| every phase | — | persist decision to `sdd/<change>/decisions/<phase>` |

Run the phase's packs in shadow with one command:

```bash
JEV_HARNESS_SDD=1 npx tsx harness/sdd/shadow-wiring.mts \
  --change <change-name> --phase <explore|design|tasks|apply|verify> \
  [--task "<one-line task>"] [--candidates path/a.ts,path/b.ts]
```

It prints, per pack, `posture / degraded / allow / reason / persisted`, and
writes the decision to memory. It **never** acts on the result.

---

## 3. Copy-paste patches

Each patch is a unified diff against the installed skill at
`~/.config/opencode/skills/<name>/…`. Apply with `git apply` in that directory
(or paste by hand). All additions are guarded by the shadow contract.

### 3.1 `_shared/skill-resolver.md` — orchestrator injects the block

Anchor: after **Step 3: Inject into Sub-Agent Prompt** (the
`## Project Standards (auto-resolved)` block).

```diff
@@ Step 3: Inject into Sub-Agent Prompt
 **Key rule**: inject the COMPACT RULES text, not paths. The sub-agent should NOT read any SKILL.md files — the rules arrive pre-digested in its prompt.
 
+### Step 3b: Inject the Decision Provider block (opt-in)
+
+If `JEV_HARNESS_SDD` is truthy, run the in-repo helper and paste its output
+into the sub-agent prompt immediately AFTER the `## Project Standards
+(auto-resolved)` block:
+
+    npx tsx harness/sdd/emit-decision-provider.mts
+
+The block names the engine, base URL and key PRESENCE (never the value) and
+tells the sub-agent to consult the JEV packs in shadow mode. If the command
+prints nothing, the harness is disabled — continue normally.
+
 ### Step 4: Include Project Conventions
```

### 3.2 `_shared/sdd-phase-common.md` — every phase honors the block

Anchor: **Section A. Skill Loading**.

```diff
@@ ## A. Skill Loading
 1. Check if the orchestrator injected a `## Project Standards (auto-resolved)` block in your launch prompt. If yes, follow those rules — they are pre-digested compact rules from the skill registry. **Do NOT read any SKILL.md files.**
+
+1b. If your prompt also carries a `## Decision Provider (auto-resolved)` block,
+   the JEV decision packs are available in **shadow mode**. After the phase's
+   main investigation, run the phase packs once:
+
+       npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase {phase}
+
+   Log the printed decisions and move on. Do NOT act on `decision.allow` while
+   in shadow; the ledger gate promotes a pack later (plan §7).
 2. If no Project Standards block was provided, check for `SKILL: Load` instructions. …
```

### 3.3 `sdd-explore/SKILL.md` — Affected Areas + ambiguity signal

Anchor: **Step 6: Return Structured Analysis**.

```diff
@@ ### Step 6: Return Structured Analysis
 Return EXACTLY this format to the orchestrator (and write the same content to `exploration.md` if saving):
 
+> Shadow decision (advisory, opt-in): once Affected Areas is drafted, run
+> `npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase explore --task "{topic}" --candidates {comma-separated affected paths}`.
+> If the `ambiguity` pack reports a high `ambiguous` probability or the
+> `file-scope` pack disagrees with your list, record it under **Risks**
+> ("Decision needed before proposal"). Do NOT block — shadow only.
+
 ```markdown
 ## Exploration: {topic}
```

### 3.4 `sdd-design/SKILL.md` — File Changes table

Anchor: **Step 3: Write design.md** → the `## File Changes` section.

```diff
@@ #### Design Document Format
 ## File Changes
 
 | File | Action | Description |
 |------|--------|-------------|
 | `path/to/new-file.ext` | Create | {What this file does} |
 
+> Shadow decision (advisory, opt-in): before finalising the table, run
+> `npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase design --task "{approach}" --candidates {comma-separated files}`.
+> `file-scope` re-ranks the candidate files and `blast-radius` scores the
+> regression risk; note disagreements under **Open Questions**. Shadow only —
+> the table stays yours to own.
+
 ## Interfaces / Contracts
```

### 3.5 `sdd-tasks/SKILL.md` — Review Workload Forecast

Anchor: **Review Workload Forecast Rules** (near the exact guard lines).

```diff
@@ ### Review Workload Forecast Rules
 Do not bury this in prose. Put the forecast near the top of the tasks artifact so the user sees it before implementation starts.
 
+> Shadow decision (advisory, opt-in): run
+> `npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase tasks --task "{change title}"`.
+> `workload-forecast` proposes the guard lines `Decision needed before apply`
+> and `Chained PRs recommended`. In shadow, treat them as a second opinion:
+> YOUR estimate and the received `delivery_strategy` are authoritative. When
+> they agree, cite the pack; when they differ, note it and keep your value.
+
 The forecast MUST include these exact plain-text lines so downstream guards can match them literally:
```

### 3.6 `sdd-apply/SKILL.md` — PreToolUse gate + test selection

Anchor: **Step 2a: Enforce Review Workload Decision** (before writing code).

```diff
@@ #### Step 2a: Enforce Review Workload Decision
 Before implementing, inspect the tasks artifact for `Review Workload Forecast`.
 
+> Shadow decision (advisory, opt-in) — run before mutating:
+> `npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase apply --task "{task}" --candidates {comma-separated changed files}`.
+> `guard` (closed), `scope-guard` (closed) and `test-impact` (open) run in
+> shadow: record high `destructive`/`injection`/`secret_exposure` or
+> `out_of_scope` signals in your return envelope, and use `test-impact`'s pick
+> to run a focused test subset. In shadow you do NOT block and you do NOT skip
+> the full suite — the closed gates only block once ACTIVE (plan §7).
+
 If the forecast says any of the following:
```

### 3.7 `sdd-verify/SKILL.md` — compliance matrix

Anchor: **Execution Steps** (step 5, map scenarios → evidence).

```diff
@@ ## Execution Steps
 5. Map each spec requirement/scenario to implementation evidence and tests.
+
+   Shadow decision (advisory, opt-in): run
+   `npx tsx harness/sdd/shadow-wiring.mts --change {change-name} --phase verify --task "{change title}" --candidates {comma-separated scenario ids}`.
+   `acceptance` proposes covered/missing per scenario, `verify` checks
+   claim-vs-evidence, `triage` classifies a failure. In shadow these only
+   annotate the matrix — real executed test results remain authoritative.
 6. Check design decisions against changed code.
```

---

## 4. Shadow wiring (what actually runs)

`harness/sdd/shadow-wiring.mts` builds the real collaborators and runs the
phase packs **observe-only**:

```ts
provider = resolveDecisionProvider({ env })   // config → env → rules (breaker)
memory   = getMemoryProvider({ project })      // JEV_MEMORY: engram | neon | none
primer   = createContextPrimer(memory)         // top-k memory + rules + candidates
runner   = createShadowRunner({ provider, primer, memory })

await runner.run(packId, { task, candidates }, { change, phase })
// → measures every provider call (decisionSample, mode "shadow")
// → persists { acted: false, mode: "shadow", result, samples } to memory
// → returns; NOTHING is blocked, redirected or mutated
```

Key invariants, enforced in code (`src/lib/system-one/harness/shadow-runner.ts`):

- `payload.acted` is always `false` — the runner never reads `result.allow` as
  an instruction.
- A provider outage is isolated by `measureDecide`: the sample records the
  error, the pack degrades, nothing throws.
- A memory failure yields `persistedId: null`; it never blocks the phase.
- The provider call is wrapped by the existing circuit breaker + rules fallback
  (`resolveDecisionProvider`), so shadow never blocks on a hosted-API outage.

---

## 5. Engram persistence convention

Every decision is saved under the change's decision namespace (plan §5):

```
topic_key: sdd/<change-name>/decisions/<phase>
title:     sdd/<change-name>/decisions/<phase>
type:      discovery
content:   { change, phase, packId, mode:"shadow", acted:false,
             provider, posture, allow, degraded, reason, tokens,
             value, samples[], at }
```

Retrieve with the standard two-step rule (previews are 300 chars):

```
mem_search(query: "sdd/<change-name>/decisions/<phase>", project: "{project}")
mem_get_observation(id: <id>)   # full JSON
```

These decisions double as an **eval set**: replay the same `state` against new
models/thresholds to calibrate the ledger gate (plan §7 step 5).

---

## 6. Enable / disable

| Env | Effect |
|---|---|
| `JEV_HARNESS_SDD=1` | enable the block + shadow CLI (opt-in) |
| `DECISION_ENGINE` | `jev` (default) · `openai-decisions` · `rules` |
| `JEV_API_KEY` / `TYPESAFE_API_KEY` / `OPENAI_API_KEY` | provider key (never rendered) |
| `DECISION_BASE_URL` / `JEV_BASE_URL` | override endpoint |
| `JEV_MEMORY` | `engram` (default) · `neon` · `none` |
| `JEV_MEMORY_PROJECT` | memory project namespace |

Unset `JEV_HARNESS_SDD` (or set `0`) to disable everything. With no key the
engine degrades to `rules` (offline, explicit no-answers) and the block still
renders correctly — useful to wire the flow before you have a key.

---

## 7. Files

| Path | What |
|---|---|
| `src/lib/system-one/harness/decision-provider.ts` | pure env → block renderer (never the key) |
| `src/lib/system-one/harness/shadow-runner.ts` | `createShadowRunner` — run a pack in shadow + persist |
| `src/lib/system-one/harness/*.test.ts` | unit fixtures (run under `npm test`) |
| `harness/sdd/emit-decision-provider.mts` | print the `## Decision Provider` block |
| `harness/sdd/shadow-wiring.mts` | opt-in shadow example (ledger + packs + Engram) |
| `harness/sdd/integration.md` | this map + patches |

See [`../../JEV-HARNESS-PLAN.md`](../../JEV-HARNESS-PLAN.md) §3 (decision
catalog), §5 (SDD map), §7 (adoption) and [`../ONBOARDING.md`](../ONBOARDING.md).
