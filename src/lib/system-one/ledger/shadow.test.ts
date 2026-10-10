import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import type { MemoryProvider } from "../context/memory/types";
import { runShadow, ShadowLedger } from "./shadow";
import type { DecisionSample } from "./types";

const questions: QuestionPack = {
  risky: { type: "noul", instructions: "Is this destructive?" },
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

function fakeMemory(): { memory: MemoryProvider; saved: unknown[] } {
  const saved: unknown[] = [];
  const memory: MemoryProvider = {
    name: "fake",
    async search() {
      return [];
    },
    async get() {
      return "";
    },
    async save(input) {
      saved.push(input);
      return "obs-1";
    },
    async context() {
      return "";
    },
  };
  return { memory, saved };
}

test("shadow: returns the decision and a shadow sample without throwing", async () => {
  const provider = mockProvider("jev", { type: "noul", noul: 0.8 });
  const { answers, sample } = await runShadow(
    provider,
    { task: "x" },
    questions,
    { packId: "guard", now: steppingClock(5) },
  );

  assert.deepEqual(answers?.risky, { type: "noul", noul: 0.8 });
  assert.equal(sample.mode, "shadow");
  assert.equal(sample.provider, "jev");
  assert.equal(sample.packId, "guard");
  assert.equal(sample.latencyMs, 5);
  assert.ok(sample.inputTokens > 0);
  assert.equal(sample.error, undefined);
});

test("shadow: a provider failure is isolated (never thrown), recorded as error", async () => {
  const provider = mockProvider("jev", { type: "noul", noul: 1 }, true);
  const ledger = new ShadowLedger();

  const { answers, sample } = await runShadow(provider, { task: "x" }, questions, {
    packId: "guard",
    sink: ledger,
  });

  assert.equal(answers, null);
  assert.ok(sample.error && sample.error.includes("unavailable"));
  assert.equal(ledger.all().length, 1);
});

test("shadow: the ledger collects samples and persists them under a topic key", async () => {
  const ledger = new ShadowLedger();
  const sample: DecisionSample = {
    provider: "jev",
    mode: "shadow",
    packId: "guard",
    inputTokens: 10,
    outputTokens: 2,
    costUsd: 0.0000004,
    latencyMs: 1,
    timestamp: 123,
  };
  ledger.record(sample);
  assert.deepEqual(ledger.all(), [sample]);

  const { memory, saved } = fakeMemory();
  const id = await ledger.persist(memory, "sdd/change/decisions/apply");

  assert.equal(id, "obs-1");
  assert.equal(saved.length, 1);
  const input = saved[0] as { topicKey: string; title: string; content: string };
  assert.equal(input.topicKey, "sdd/change/decisions/apply");
  assert.ok(input.content.includes('"provider": "jev"'));

  ledger.clear();
  assert.equal(ledger.all().length, 0);
});
