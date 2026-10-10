import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import {
  answerMapMatches,
  DEFAULT_GATE,
  evaluateGate,
  runAb,
  type AbTask,
} from "./ab";

const questions: QuestionPack = {
  risky: { type: "noul", instructions: "Is this destructive?" },
};

const expected: AnswerMap<QuestionPack> = {
  risky: { type: "noul", noul: 0.9 },
};

function mockProvider(
  name: string,
  answer: Answer,
  fail = false,
): DecisionProvider {
  return {
    name,
    async decide<T extends QuestionPack>(
      _state: State,
      pack: T,
    ): Promise<AnswerMap<T>> {
      if (fail) throw new Error(`${name} unavailable`);
      const out: Record<string, Answer> = {};
      for (const id of Object.keys(pack)) out[id] = answer;
      return out as AnswerMap<T>;
    },
  };
}

function steppingClock(stepMs: number): () => number {
  let t = 0;
  return () => (t += stepMs);
}

const big = (n: number): State => ({ task: "x", files: "y".repeat(n) });

test("ab: a primed candidate is cheaper and verified; an expanded one is wasted", async () => {
  const tasks: AbTask[] = [
    { id: "primed-1", state: big(4_000), candidateState: big(200), questions, expected },
    { id: "primed-2", state: big(4_000), candidateState: big(200), questions, expected },
    { id: "expanded-waste", state: big(200), candidateState: big(6_000), questions, expected },
  ];

  const result = await runAb({
    packId: "context-prime",
    baseline: mockProvider("openai-decisions", { type: "noul", noul: 0.9 }),
    candidate: mockProvider("jev", { type: "noul", noul: 0.9 }),
    tasks,
    now: steppingClock(3),
  });

  assert.equal(result.tasks.length, 3);
  assert.ok(
    result.candidate.inputTokens < result.baseline.inputTokens,
    `candidate ${result.candidate.inputTokens} < baseline ${result.baseline.inputTokens}`,
  );
  assert.ok(result.delta.costSavedPct > 0);
  assert.equal(result.baseline.verifiedTasks, 3);
  assert.equal(result.candidate.verifiedTasks, 3);
  assert.equal(result.candidate.wastedTasks, 1);
  assert.equal(result.candidate.costPerVerifiedTask !== null, true);

  const gate = evaluateGate(result);
  assert.equal(gate.pass, true, gate.reasons.join("; "));
});

test("ab: identical runs save nothing and fail the cost gate", async () => {
  const tasks: AbTask[] = [
    { id: "same", state: big(1_000), questions, expected },
  ];
  const result = await runAb({
    baseline: mockProvider("jev", { type: "noul", noul: 0.9 }),
    candidate: mockProvider("jev", { type: "noul", noul: 0.9 }),
    tasks,
    now: steppingClock(2),
  });

  assert.equal(result.delta.costSavedPct, 0);
  assert.equal(evaluateGate(result).pass, false);
  assert.ok(
    evaluateGate(result).reasons.some((r) => r.includes("cost reduction")),
  );
});

test("ab: a candidate that fails verification is wasted and fails the quality gate", async () => {
  const tasks: AbTask[] = [
    { id: "regressed", state: big(4_000), candidateState: big(200), questions, expected },
  ];
  const result = await runAb({
    baseline: mockProvider("openai-decisions", { type: "noul", noul: 0.9 }),
    candidate: mockProvider("jev", { type: "noul", noul: 0.1 }, true),
    tasks,
    now: steppingClock(2),
  });

  assert.equal(result.candidate.failedTurns, 1);
  assert.equal(result.candidate.verifiedTasks, 0);
  assert.equal(result.candidate.wastedTasks, 1);
  assert.equal(result.delta.verifiedRatio, 0);
  assert.equal(evaluateGate(result).pass, false);
  assert.ok(evaluateGate(result).reasons.some((r) => r.includes("quality")));
});

test("ab: answerMapMatches honours tolerance and rejects regressions", () => {
  assert.equal(answerMapMatches({ risky: { type: "noul", noul: 0.85 } }, expected), true);
  assert.equal(answerMapMatches({ risky: { type: "noul", noul: 0.5 } }, expected), false);
  assert.equal(answerMapMatches(null, expected), false);
  assert.equal(
    answerMapMatches({ risky: { type: "noul", noul: 0.5 } }, expected, 0.5),
    true,
  );
  assert.equal(DEFAULT_GATE.minCostReductionPct, 30);
});
