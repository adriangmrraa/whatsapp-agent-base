# JEV Harness — Ledger & Honest Results

How the JEV harness measures whether a decision pack earns its keep, and what it
has **actually** shown. The measurement code is
[`src/lib/system-one/ledger/`](../src/lib/system-one/ledger/); the calibration
harness is [`src/lib/system-one/eval/`](../src/lib/system-one/eval/). The
canonical harness doc is [`jev-harness.md`](jev-harness.md); the adoption
methodology is §9 there.

> **This is a measurement-only layer.** Nothing in `ledger/` changes a pack's
> behavior, mutates state, or blocks a caller. Adoption is shadow-first: a pack
> is promoted out of shadow only after the A/B gate proves it.

---

## 1. Measurement model

### 1.1 The unit: `DecisionSample`

Every provider call is measured into one sample (`ledger/types.ts`):

```ts
interface DecisionSample {
  provider: string;      // "jev" | "openai-decisions" | "rules" | ...
  mode: "shadow" | "ab";
  packId?: string;
  inputTokens: number;   // ESTIMATED (~4 chars/token)
  outputTokens: number;  // ESTIMATED
  costUsd: number;       // tokens × the provider's cost model
  latencyMs: number;
  error?: string;        // set on failure; answers are null
  timestamp: number;
}
```

`measureDecide(provider, state, questions, meta)` is the single primitive shared
by shadow and A/B. It **never throws** — a provider failure becomes a sample with
`error` set and `answers: null`, so a measurement can never redirect or block a
real path.

Two honesty notes baked into the design:

- **Tokens are estimates.** The provider-neutral `decide` contract deliberately
  does not surface the hosted APIs' `usage` blocks, so the ledger derives tokens
  from the exact `state` + `questions` a provider was handed. That makes numbers
  **comparable across providers in an A/B** — what the gate needs — not
  billing-exact.
- **Prices are from the plan** (§1.1/§1.2), in USD per 1M input tokens
  (`jev` 0.042, `openai-decisions` 0.1, `rules` 0); output is free on both. They
  are overridable per provider via `AbOptions.costModels`.

### 1.2 Shadow (`ledger/shadow.ts`)

`runShadow` runs a provider against a pack and returns the candidate answers plus
a `DecisionSample`. It **never throws**, and the returned answers are
**observational only** — callers must not branch on them. `ShadowLedger`
collects samples in memory and can `persist()` them to a `MemoryProvider` under a
topic key (e.g. `sdd/<change>/decisions/<phase>`).

### 1.3 A/B (`ledger/ab.ts`)

`runAb` runs the **same labeled task set** through a baseline (rules-only or
LLM-only) and through a +Jev candidate. The candidate may see a smaller
`candidateState` — exactly how context priming is meant to save tokens. Per side
it reports turns, failed turns, tokens, cost, wall-clock, avg/p95 latency,
verified tasks, **cost-per-verified-task**, and `wastedTasks`.

`verified` is decided by ground truth: `task.expected` answers (matched within a
tolerance) or a custom `task.verify`. `wasted` is the plan's honesty check: a
decision that was *supposed* to save work but did not — it cost **at least as
much** as the baseline, **or** it regressed verification (baseline verified,
candidate did not). A pack that never saves is a negative result the ledger must
surface, not hide.

> HONEST: consider the case where a smaller `candidateState` *expands* — e.g. the
> `npm run jev:report` offline fixture includes an `expanded-waste` task whose
> candidate state is deliberately larger. The ledger reports it as wasted and the
> gate fails. That is the point.

### 1.4 Stats + report (`ledger/stats.ts`)

`aggregate(samples)` groups by provider and by pack and totals the metrics.
`formatStatsReport` / `formatAbReport` render plain-text, dependency-free reports
so a result can be pasted into a PR or an Engram observation unchanged.

### 1.5 The gate (`evaluateGate`)

Activate a pack **only** if all three hold:

| Threshold | Default | Meaning |
|---|---|---|
| `minCostReductionPct` | **30%** | candidate cost must fall at least 30% vs baseline |
| `minQualityRatio` | **0.95** | candidate verified / baseline verified ≥ 0.95 |
| `maxP95LatencyRatio` | **1.2** | candidate p95 latency ≤ 1.2× baseline |

These are the plan's defaults — **per-pack tunables, not hardcoded truth**.
Otherwise: keep the pack in shadow, or drop it.

### 1.6 Golden eval (`eval/`)

`eval/fixtures.ts` holds **labelled fixtures as code** (no network, no key) for
the three highest-leverage packs: `file-scope`, `workload-forecast`, `guard`.
`runGoldenEval` runs the **real** pack functions against scripted answers,
scores answer-level agreement (`answerMapMatches`) plus the derived pack decision
against the golden decision, and measures each via the ledger. `sweepGoldenEval`
sweeps a threshold and returns the agreement/escalation curve — the calibration
input for step 5 of the adoption methodology.

---

## 2. The report CLI

```bash
npm run jev:report                # offline A/B fixture + gate (no key, no network)
npm run jev:report -- --in <file> # aggregate a DecisionSample[] JSON file
```

The default mode runs a self-contained fixture with mocked providers, so the
report — including a **failing** `expanded-waste` task and the gate verdict — is
demonstrable with no API key. It is a **demonstration of the mechanism**, not a
claim about production savings.

---

## 3. Adoption sequence (recap)

```
SHADOW → MEASURE → A/B → GATE → CALIBRATE → PUBLISH
```

1. **Shadow** — log decisions; change nothing.
2. **Measure** — collect samples (calls, latency, tokens, $, agreement, wasted).
3. **A/B** — baseline vs +Jev, N≥3, ≥2 fixture classes.
4. **Gate** — cost ↓ ≥30%, quality ≥0.95×, p95 ≤1.2×.
5. **Calibrate** — tune thresholds on your own labeled data; re-run on a model
   bump (pin an exact model version).
6. **Publish** — record what worked **and what did not**.

---

## 4. Honest caveats (what Jev does and does NOT do)

These are not hedges — they are the reason the harness is shadow-first.

### 4.1 It is not deterministic and not a truth oracle

Independent audits reported that Jev came **last of 12 on LegalBench**; that
**96.9%** of per-option probabilities were **exactly 0** in one banking set;
that **50 identical requests produced 15 different answers**; and that it was
**~6.3×** faster (not 40–200×) in one benchmark. A probability from Jev is a
**score to be thresholded**, not a fact. **Calibrate on your own data.**

### 4.2 Some ablations show no gain

The Jev signal can add **nothing over retrieval/rules** on some tasks. That is
why a **rules baseline is mandatory** and why the `wasted` metric exists: it
forces a pack to demonstrate it beats doing less.

### 4.3 Small or chunked states can cost MORE

One ledger observed a **reduce pattern at −523%** — i.e. chopping state into
smaller pieces *increased* cost. State is billed on every call; a “priming” pack
that expands or fragments context can lose. Measure per pack.

### 4.4 Type-safety is not injection resistance

A provider cannot emit an invalid *type*. That says nothing about whether
hostile content in `state` (fetched pages, tool output) can **steer** the
decision. `guard` exists for exactly this, and it is `closed` by design.

### 4.5 Ecosystem noise

Much of the Jev blogosphere is AI-written SEO. Only **`docs.typesafe.ai` is
first-party**. Cite primary sources and re-verify claims against your own ledger.

### 4.6 Multi-tenant privacy

Engram is **project-scoped developer memory**. The product's tenant memory is
`knowledge_chunks` on pgvector, `tenant_id`-scoped. The harness's `jen_memory`
table is scoped by both `tenant_id` and `project`, and never runs an unscoped
query — but the discipline is yours to keep: **never put tenant data in a
hosted-provider `state`, and never cross the two memory systems.**

### 4.7 The shipped thresholds are uncalibrated

Every default in [`policy.ts`](../src/lib/system-one/policy.ts) is a **starting
point**. Treat it as such until your golden eval and A/B say otherwise.

---

## 5. What this means in practice

- Start every pack in **shadow**; read the ledger before promoting.
- Keep the **rules baseline** in the A/B — a pack that cannot beat it is a net
  loss.
- Watch **cost-per-verified-task** and **wasted**, not raw latency.
- **Re-calibrate on every model bump**; pin the model version.
- Publish negatives. A pack that did not help is a useful, shipped result.

---

## 6. References

- Canonical harness doc: [`jev-harness.md`](jev-harness.md).
- Plan (§7 adoption, §10 risks): [`../JEV-HARNESS-PLAN.md`](../JEV-HARNESS-PLAN.md).
- Code: `src/lib/system-one/ledger/`, `src/lib/system-one/eval/`.
- Report CLI: `scripts/jev-report.ts` (`npm run jev:report`).
