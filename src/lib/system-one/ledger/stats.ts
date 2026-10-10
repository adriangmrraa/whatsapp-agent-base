import type { AbResult, ProviderRunMetrics } from "./ab";
import { percentile, sum, type DecisionSample } from "./types";

// ─── Ledger stats — aggregate + report ───────────────────────────────────────
//
// The last piece of Phase 4: turn raw `DecisionSample`s into a human-readable
// ledger. `aggregate` groups by provider and by pack; `formatStatsReport` and
// `formatAbReport` render the plain-text reports the `jev:report` CLI prints.
// The format is deliberately ASCII and dependency-free so a result can be
// pasted into a PR or an Engram observation unchanged (plan §7 step 6, §8.2).

export interface ProviderStats {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  wallClockMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface AggregateStats {
  samples: number;
  errors: number;
  totals: ProviderStats;
  byProvider: Record<string, ProviderStats>;
  byPack: Record<string, ProviderStats>;
}

function statsOf(samples: readonly DecisionSample[]): ProviderStats {
  const wallClockMs = sum(samples.map((s) => s.latencyMs));
  return {
    calls: samples.length,
    errors: samples.filter((s) => s.error).length,
    inputTokens: sum(samples.map((s) => s.inputTokens)),
    outputTokens: sum(samples.map((s) => s.outputTokens)),
    costUsd: sum(samples.map((s) => s.costUsd)),
    wallClockMs,
    avgLatencyMs: samples.length > 0 ? wallClockMs / samples.length : 0,
    p95LatencyMs: percentile(
      samples.map((s) => s.latencyMs),
      0.95,
    ),
  };
}

function groupBy(
  samples: readonly DecisionSample[],
  keyOf: (sample: DecisionSample) => string,
): Record<string, ProviderStats> {
  const groups = new Map<string, DecisionSample[]>();
  for (const sample of samples) {
    const key = keyOf(sample);
    const bucket = groups.get(key);
    if (bucket) bucket.push(sample);
    else groups.set(key, [sample]);
  }
  const out: Record<string, ProviderStats> = {};
  for (const [key, bucket] of groups) out[key] = statsOf(bucket);
  return out;
}

/** Aggregate samples into provider/pack groups plus a grand total. */
export function aggregate(samples: readonly DecisionSample[]): AggregateStats {
  return {
    samples: samples.length,
    errors: samples.filter((s) => s.error).length,
    totals: statsOf(samples),
    byProvider: groupBy(samples, (s) => s.provider),
    byPack: groupBy(samples, (s) => s.packId ?? "(none)"),
  };
}

function usd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function statsRow(label: string, stats: ProviderStats): string {
  return [
    `  ${label.padEnd(20)}`,
    `calls=${String(stats.calls).padStart(4)}`,
    `err=${String(stats.errors).padStart(3)}`,
    `in=${String(stats.inputTokens).padStart(7)}`,
    `out=${String(stats.outputTokens).padStart(6)}`,
    `cost=${usd(stats.costUsd).padStart(11)}`,
    `avg=${stats.avgLatencyMs.toFixed(1)}ms`,
    `p95=${stats.p95LatencyMs.toFixed(1)}ms`,
  ].join(" ");
}

export function formatStatsReport(stats: AggregateStats): string {
  const lines: string[] = [];
  lines.push("JEV ledger — aggregate stats");
  lines.push(`samples=${stats.samples} errors=${stats.errors}`);
  lines.push("");
  lines.push("by provider:");
  for (const [name, s] of Object.entries(stats.byProvider)) {
    lines.push(statsRow(name, s));
  }
  lines.push("");
  lines.push("by pack:");
  for (const [name, s] of Object.entries(stats.byPack)) {
    lines.push(statsRow(name, s));
  }
  lines.push("");
  lines.push("total:");
  lines.push(statsRow("(all)", stats.totals));
  return lines.join("\n");
}

function metricsRow(label: string, metrics: ProviderRunMetrics): string {
  const cpt =
    metrics.costPerVerifiedTask === null
      ? "n/a"
      : usd(metrics.costPerVerifiedTask);
  return [
    `  ${label.padEnd(18)}`,
    `turns=${String(metrics.turns).padStart(3)}`,
    `verif=${String(metrics.verifiedTasks).padStart(3)}`,
    `wasted=${String(metrics.wastedTasks).padStart(3)}`,
    `in=${String(metrics.inputTokens).padStart(7)}`,
    `out=${String(metrics.outputTokens).padStart(5)}`,
    `cost=${usd(metrics.costUsd).padStart(11)}`,
    `cost/verified=${cpt.padStart(11)}`,
    `p95=${metrics.p95LatencyMs.toFixed(1)}ms`,
  ].join(" ");
}

export function formatAbReport(result: AbResult): string {
  const lines: string[] = [];
  lines.push("JEV ledger — A/B (baseline vs +Jev)");
  lines.push(`pack=${result.packId ?? "(none)"} tasks=${result.tasks.length}`);
  lines.push("");
  lines.push("baseline:");
  lines.push(metricsRow(result.baseline.provider, result.baseline));
  lines.push("candidate:");
  lines.push(metricsRow(result.candidate.provider, result.candidate));
  lines.push("");
  const d = result.delta;
  lines.push("delta:");
  lines.push(
    `  cost ${usd(d.costSavedUsd)} (${d.costSavedPct.toFixed(1)}%)  ` +
      `turns ${d.turnsSaved}  input-tokens ${d.inputTokensSaved}  ` +
      `wall-clock ${d.wallClockSavedMs}ms  quality-ratio ${d.verifiedRatio.toFixed(2)}`,
  );
  lines.push("");
  lines.push("wasted tasks (meant to save, did not):");
  const wasted = result.tasks.filter((t) => t.wasted);
  if (wasted.length === 0) {
    lines.push("  (none)");
  } else {
    for (const task of wasted) {
      lines.push(
        `  ${task.id}: baseline=${usd(task.baseline.costUsd)} candidate=${usd(task.candidate.costUsd)}`,
      );
    }
  }
  return lines.join("\n");
}
