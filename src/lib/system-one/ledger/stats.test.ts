import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
  Answer,
} from "../provider/types";
import { aggregate, formatAbReport, formatStatsReport } from "./stats";
import { runAb } from "./ab";
import type { DecisionSample } from "./types";

function sample(overrides: Partial<DecisionSample>): DecisionSample {
  return {
    provider: "jev",
    mode: "shadow",
    packId: "context-prime",
    inputTokens: 100,
    outputTokens: 5,
    costUsd: 0.0000042,
    latencyMs: 4,
    timestamp: 1,
    ...overrides,
  };
}

test("stats: aggregates by provider and pack with totals and errors", () => {
  const stats = aggregate([
    sample({ provider: "jev", packId: "context-prime", inputTokens: 100 }),
    sample({ provider: "jev", packId: "guard", inputTokens: 50, latencyMs: 8 }),
    sample({
      provider: "rules",
      packId: "guard",
      inputTokens: 20,
      error: "boom",
    }),
  ]);

  assert.equal(stats.samples, 3);
  assert.equal(stats.errors, 1);
  assert.equal(stats.totals.calls, 3);
  assert.equal(stats.totals.inputTokens, 170);
  assert.equal(stats.byProvider.jev.calls, 2);
  assert.equal(stats.byProvider.jev.inputTokens, 150);
  assert.equal(stats.byProvider.rules.errors, 1);
  assert.equal(stats.byPack.guard.calls, 2);
  assert.equal(stats.byPack["context-prime"].calls, 1);
  assert.equal(stats.byProvider.jev.p95LatencyMs, 8);
});

test("stats: the text report is ASCII and names providers and packs", () => {
  const report = formatStatsReport(
    aggregate([
      sample({ provider: "jev", packId: "context-prime" }),
      sample({ provider: "openai-decisions", packId: "review" }),
    ]),
  );
  assert.ok(report.includes("JEV ledger — aggregate stats"));
  assert.ok(report.includes("by provider:"));
  assert.ok(report.includes("by pack:"));
  assert.ok(report.includes("total:"));
  assert.ok(report.includes("openai-decisions"));
  assert.ok(report.includes("context-prime"));
});

function mockProvider(name: string, answer: Answer): DecisionProvider {
  return {
    name,
    async decide<T extends QuestionPack>(
      _state: State,
      pack: T,
    ): Promise<AnswerMap<T>> {
      const out: Record<string, Answer> = {};
      for (const id of Object.keys(pack)) out[id] = answer;
      return out as AnswerMap<T>;
    },
  };
}

test("stats: the A/B report renders both sides, delta, and wasted tasks", async () => {
  const result = await runAb({
    packId: "context-prime",
    baseline: mockProvider("openai-decisions", { type: "noul", noul: 0.9 }),
    candidate: mockProvider("jev", { type: "noul", noul: 0.9 }),
    tasks: [
      {
        id: "t1",
        state: { task: "x", files: "y".repeat(4_000) },
        candidateState: { task: "x", files: "y".repeat(100) },
        questions: { risky: { type: "noul", instructions: "destructive?" } },
        expected: { risky: { type: "noul", noul: 0.9 } },
      },
      {
        id: "t2-waste",
        state: { task: "x", files: "y".repeat(100) },
        candidateState: { task: "x", files: "y".repeat(8_000) },
        questions: { risky: { type: "noul", instructions: "destructive?" } },
        expected: { risky: { type: "noul", noul: 0.9 } },
      },
    ],
  });

  const report = formatAbReport(result);
  assert.ok(report.includes("JEV ledger — A/B (baseline vs +Jev)"));
  assert.ok(report.includes("baseline:"));
  assert.ok(report.includes("candidate:"));
  assert.ok(report.includes("delta:"));
  assert.ok(report.includes("t2-waste"));
});
