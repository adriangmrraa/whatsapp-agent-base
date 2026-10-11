---
name: jev-decide
description: >-
  Make bounded semantic decisions in a coding workflow using the JEV packs:
  which files/folders to touch, which skills/tests apply, how big the workload
  is, whether something is ambiguous or out of scope, destructive/injection
  gates, failure triage, and claim-vs-evidence checks. Trigger when the agent
  must choose among candidates, gate a risky action, size work before
  implementing, or triage a failure — especially inside the SDD flow
  (explore/design/tasks/apply/verify).
---

# jev-decide

Use the **JEV decision packs** to make bounded, typed semantic decisions before
the expensive/generative step. Code owns the workflow; Jev owns the bounded
decision; the LLM owns generation; memory (Engram) gives every decision context
and an audit trail.

This skill works the same from `.agents/skills/`, `.opencode/skills/`, and
`.claude/skills/` — it is a single `SKILL.md`. Install it with
`harness/install.sh` (see `harness/ONBOARDING.md`).

## Mental model (read this first)

- **Bounded decision, not generation.** A pack takes a `state` (text/JSON) plus
  typed `questions` and returns typed probabilistic `answers` — `noul`
  (probability of yes), `choice` (pick one), `score` (position on a rubric).
  Never ask a pack to write code or prose.
- **Probabilities are scores, not truth.** Thresholds live in code and are
  **uncalibrated by default** (plan §7). Treat every default threshold as a
  starting point to tune on your own labelled data.
- **Fail posture matters.**
  - `open` packs are **advisory**: no-answer or low confidence → proceed, do
    not block.
  - `closed` packs are **protective**: no-answer or uncertainty → **block /
    ask a human** (fail closed). Never "log and continue" on a closed gate.
- **Shadow first.** Run a pack, log the decision, change nothing until the
  ledger shows it earns its keep (plan §7).

## How to invoke (preferred: MCP tools)

The optional stdio MCP server at `harness/mcp/` exposes one tool per pack
(prefixed `jev_`). Register it once (see `harness/mcp/README.md`), then call
the tool with a `state` object. For candidate-selection packs you may also pass
`options` (the candidate list) and the server builds the `choice` criteria from
them.

```
jev_file_scope      { state }                       → noul `touches` + choice `scope`
jev_context_prime   { state }                       → noul `sufficient` + choice `focus`
jev_skill_route     { state, options }              → choice `skill` (+ `none`)
jev_workload_forecast { state }                     → score `workload` + noul `needs_decision` + noul `chain`
jev_ambiguity       { state }                       → noul `ambiguous`          [closed]
jev_scope_guard     { state }                       → noul `out_of_scope`       [closed]
jev_test_impact     { state, options }              → choice `tests` (+ `none`)
jev_triage          { state }                       → choice `cause` + noul `is_regression`
jev_acceptance      { state }                       → choice `status` + noul `covered`
jev_blast_radius    { state }                       → score `risk`
jev_review          { state }                       → score `correctness|spec_fit|test_gap|radius` + noul `block`
jev_verify          { state }                       → noul `claims_evidenced` + choice `verdict`
jev_guard           { state }                       → hard rules in code + choice `risk` + noul hazards [closed]
jev_decide          { state, questions }            → raw contract escape hatch
```

Every tool returns JSON: `{ pack, provider, decision: { allow, action, reason,
... }, answers }`. Act on `decision.allow` / `decision.action`.

Without MCP you can still call the same packs from application code through
`src/lib/system-one/` (the in-repo TS source of truth). This skill and the MCP
catalog mirror those packs; keep them in sync.

## Pack catalog — when to call each

| Pack | Decision | Type | Posture | Call it when |
|---|---|---|---|---|
| `context-prime` | which memories/docs/rules enter `state` | noul + choice | open | before every phase; you need the minimal sufficient context |
| `file-scope` | which files/folders are affected | noul + choice | open | `sdd-explore` "Affected Areas", `sdd-design` "File Changes" |
| `skill-route` | which skills apply | choice (+`none`) | open | orchestrator, before delegating |
| `workload-forecast` | is the change >400 lines / needs chaining? | score + noul ×2 | open | `sdd-tasks` "Review Workload Forecast" |
| `ambiguity` | is the requirement ambiguous? | noul | **closed** | `sdd-explore`, `sdd-spec` — before building the wrong thing |
| `scope-guard` | does the diff leave proposal scope? | noul | **closed** | `sdd-apply` before mutating |
| `test-impact` | which tests exercise this diff? | choice (+`none`) | open | `sdd-apply` / CI — run 5 instead of 500 |
| `triage` | regression, flake, or env? | choice + noul | open | any debugging loop |
| `acceptance` | is each spec scenario covered by a test? | choice + noul | open | `sdd-verify` (tests are authoritative) |
| `blast-radius` | regression risk of the change | score | open | `sdd-verify`, pre-merge |
| `review` | diff rubric (correctness/spec/test-gap/radius) | score ×N + noul | open | pre-merge review |
| `verify` | claims backed by evidence? | noul + choice | open (advisory) | `sdd-verify` |
| `guard` | destructive / injection / secret-exposure? | hard rules in code + `choice` (`risk`) + noul hazards | **closed** | before any tool result enters context or any mutation |

Guard lines `sdd-tasks` must emit verbatim (from `workload-forecast`):
`Decision needed before apply` (when `needs_decision` is high) and
`Chained PRs recommended` (when `chain` is high).

## Memory: feed the decision, persist the decision

- **Before** a decision, assemble `state` from memory: the task, top-k artifacts
  (`mem_search` → always `mem_get_observation` for FULL content, because Engram
  previews are ~300 chars), compact skill-registry rules, and candidates.
- **After** a decision, persist it to Engram so it is auditable and replayable:
  `mem_save(title, content, topic = "sdd/<change>/decisions/<phase>")`.
- Never put secrets/PII in `state` (it may leave the process to a hosted API).
  The in-repo `context/redact.ts` already strips denied keys.

## Do NOT use a pack for

Counting, date math, arithmetic, sorting (stay in code); code/text generation;
being the ground-truth authority (tests are); enforcing hard rules (policy
engine); irreversible actions. **No threshold without calibration; no `choice`
without a fallback (`none`); multi-label means several `noul`; thresholds are
per-type (`noul` absolute ≠ `choice` relative).**

## Example

```
state = {
  task: "Add YCloud webhook signature verification",
  memories: ["sdd/ycloud-verify/design", "convention: fail-closed on auth"],
  candidates: [{ path: "src/lib/providers/ycloud.ts" }, { path: "src/app/api/webhook/whatsapp/route.ts" }]
}
→ jev_file_scope { state }
→ { decision: { allow: true, action: "pick:few-files" }, answers: { touches: { noul: 0.93 }, scope: { choice: "few-files" } } }

→ jev_guard { state: "diff adds HMAC check; no secret literals" }
→ { decision: { allow: true, action: "proceed", reason: "below_threshold" } }   # no destructive/injection signal
```

## Reference

- Plan: `JEV-HARNESS-PLAN.md` §3 (decision catalog), §5 (SDD map), §7 (adoption).
- In-repo source of truth: `src/lib/system-one/` (provider, context, packs).
- Install / configure: `harness/ONBOARDING.md`, `harness/config.example.json`.
- MCP registration: `harness/mcp/README.md`.
