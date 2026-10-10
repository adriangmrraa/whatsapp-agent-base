import { test } from "node:test";
import assert from "node:assert/strict";
import type { MemoryProvider } from "../context/memory/types";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
} from "../provider/types";
import { fakePrimer, fakeProvider, noul, choice } from "../packs/test-support";
import {
  createShadowRunner,
  decisionTopicKey,
  type ShadowRunnerDeps,
} from "./shadow-runner";

interface SaveSpy {
  memory: MemoryProvider;
  saved: { title: string; topicKey: string; type: string; content: string }[];
}

function fakeMemory(opts: { fail?: boolean } = {}): SaveSpy {
  const saved: SaveSpy["saved"] = [];
  const memory: MemoryProvider = {
    name: "fake-memory",
    async search() {
      return [];
    },
    async get() {
      return "";
    },
    async save(input) {
      if (opts.fail) throw new Error("memory unavailable");
      saved.push(input);
      return "obs-123";
    },
    async context() {
      return "";
    },
  };
  return { memory, saved };
}

function throwingProvider(): DecisionProvider {
  return {
    name: "broken",
    async decide<T extends QuestionPack>(): Promise<AnswerMap<T>> {
      throw new Error("provider down");
    },
  };
}

function deps(over: Partial<ShadowRunnerDeps> = {}): {
  deps: ShadowRunnerDeps;
  spy: SaveSpy;
} {
  const spy = fakeMemory();
  return {
    spy,
    deps: {
      provider: fakeProvider({}),
      primer: fakePrimer(),
      memory: spy.memory,
      now: () => 1_000,
      ...over,
    },
  };
}

test("decisionTopicKey: builds the sdd decisions key", () => {
  assert.equal(
    decisionTopicKey("add-dark-mode", "apply"),
    "sdd/add-dark-mode/decisions/apply",
  );
});

test("shadow run: produces the pack value, records a shadow sample, persists (acted=false)", async () => {
  const { deps: d, spy } = deps({
    provider: fakeProvider({
      primary: choice("sdd-apply"),
      skill_0: noul(0.9),
      skill_1: noul(0.1),
    }),
  });
  const runner = createShadowRunner(d);

  const run = await runner.run(
    "skill-route",
    {
      task: "wire packs into apply",
      candidates: [{ id: "sdd-apply" }, { id: "sdd-verify" }],
    },
    { change: "demo", phase: "explore" },
  );

  assert.deepEqual(run.result.value, { skills: ["sdd-apply"], primary: "sdd-apply" });
  assert.equal(run.samples.length, 1);
  assert.equal(run.samples[0].mode, "shadow");
  assert.equal(run.samples[0].packId, "skill-route");
  assert.equal(run.samples[0].provider, "fake");

  assert.equal(run.topicKey, "sdd/demo/decisions/explore");
  assert.equal(run.payload.acted, false);
  assert.equal(run.payload.mode, "shadow");
  assert.equal(run.payload.packId, "skill-route");
  assert.equal(run.payload.at, 1_000);
  assert.equal(run.persistedId, "obs-123");

  assert.equal(spy.saved.length, 1);
  assert.equal(spy.saved[0].topicKey, "sdd/demo/decisions/explore");
  assert.match(spy.saved[0].content, /"acted": false/);
  assert.match(spy.saved[0].content, /"mode": "shadow"/);
});

test("shadow run: a provider outage is isolated (never thrown) and still persists", async () => {
  const { deps: d } = deps({ provider: throwingProvider() });
  const runner = createShadowRunner(d);

  const run = await runner.run(
    "file-scope",
    { task: "x", candidates: [{ id: "src/a.ts" }] },
    { change: "demo", phase: "design" },
  );

  assert.equal(run.result.degraded, true);
  assert.equal(run.samples.length, 1);
  assert.ok(run.samples[0].error && run.samples[0].error.includes("provider down"));
  assert.equal(run.payload.acted, false);
  // open pack: advisory, so it still allows even with no signal
  assert.equal(run.payload.allow, true);
});

test("shadow run: memory failure yields persistedId null without throwing", async () => {
  const spy = fakeMemory({ fail: true });
  const runner = createShadowRunner({
    provider: fakeProvider({}),
    primer: fakePrimer(),
    memory: spy.memory,
  });

  const run = await runner.run(
    "verify",
    { task: "x" },
    { change: "demo", phase: "verify" },
  );
  assert.equal(run.persistedId, null);
});

test("shadow run: unknown pack throws", async () => {
  const { deps: d } = deps();
  const runner = createShadowRunner(d);
  await assert.rejects(
    () => runner.run("nope", { task: "x" }, { change: "demo", phase: "explore" }),
    /unknown pack: nope/,
  );
});
