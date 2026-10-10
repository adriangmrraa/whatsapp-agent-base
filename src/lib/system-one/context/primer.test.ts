import { test } from "node:test";
import assert from "node:assert/strict";
import { createContextPrimer } from "./primer";
import { REDACTED } from "./redact";
import type { MemRef, MemoryProvider } from "./memory/types";

function fakeMemory(
  refs: MemRef[],
  contentById: Record<string, string>,
): { memory: MemoryProvider; gets: string[]; searches: string[] } {
  const gets: string[] = [];
  const searches: string[] = [];
  const memory: MemoryProvider = {
    name: "fake",
    async search(query) {
      searches.push(query);
      return refs;
    },
    async get(id) {
      gets.push(id);
      return contentById[id] ?? "";
    },
    async save() {
      return "";
    },
    async context() {
      return "";
    },
  };
  return { memory, gets, searches };
}

test("primer: hydrates full content via get (never the preview)", async () => {
  const refs: MemRef[] = [
    { id: "1", title: "one", preview: "SHORT PREVIEW" },
    { id: "1", title: "dup", preview: "dup" },
    { id: "2", title: "two" },
  ];
  const { memory, gets } = fakeMemory(refs, {
    "1": "FULL CONTENT ONE",
    "2": "FULL CONTENT TWO",
  });

  const primer = createContextPrimer(memory);
  const result = await primer.build("context-prime", { task: "which files" });

  assert.deepEqual(gets.sort(), ["1", "2"]);
  const state = result.state as Record<string, unknown>;
  const memories = state.memories as Array<{ id: string; content: string }>;
  assert.equal(memories.length, 2);
  assert.equal(memories[0].content, "FULL CONTENT ONE");
  assert.ok(JSON.stringify(state).includes("FULL CONTENT ONE"));
  assert.ok(!JSON.stringify(state).includes("SHORT PREVIEW"));
});

test("primer: trims memories and candidates to the token budget", async () => {
  const refs: MemRef[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    title: `mem-${i}`,
  }));
  const contentById: Record<string, string> = {};
  for (let i = 0; i < 20; i += 1) contentById[String(i)] = "x".repeat(400);

  const { memory } = fakeMemory(refs, contentById);
  const primer = createContextPrimer(memory);

  const result = await primer.build("file-scope", {
    task: "select files",
    budgetTokens: 80,
    candidates: Array.from({ length: 20 }, (_, i) => ({
      path: `src/f${i}.ts`,
      snippet: "y".repeat(200),
    })),
  });

  assert.ok(result.tokens <= 80, `tokens=${result.tokens}`);
  assert.ok(result.omittedMemories > 0);
  assert.ok(result.omittedCandidates > 0);
  const state = result.state as Record<string, unknown>;
  const memories = (state.memories as unknown[] | undefined) ?? [];
  assert.ok(memories.length < 20);
});

test("primer: redacts denied fields and scrubs secrets from content", async () => {
  const secret = "sk-abcdefghijklmnop1234";
  const { memory } = fakeMemory([{ id: "1", title: "one" }], {
    "1": `token is ${secret}`,
  });
  const primer = createContextPrimer(memory);

  const result = await primer.build("verify", {
    task: "check",
    facts: { apiKey: secret, role: "admin", phone: "5491112345678" },
  });

  const serialized = JSON.stringify(result.state);
  assert.ok(!serialized.includes(secret));
  const facts = (result.state as Record<string, unknown>).facts as Record<string, unknown>;
  assert.equal(facts.apiKey, REDACTED);
  assert.equal(facts.phone, REDACTED);
  assert.equal(facts.role, "admin");
});

test("primer: batches provided queries and includes compact rules", async () => {
  const { memory, searches } = fakeMemory([], {});
  const primer = createContextPrimer(memory);

  const result = await primer.build("skill-route", {
    task: "route",
    queries: ["alpha", "beta"],
    rules: ["rule-a", "rule-b"],
  });

  assert.deepEqual(searches.sort(), ["alpha", "beta"]);
  const state = result.state as Record<string, unknown>;
  assert.deepEqual(state.rules, ["rule-a", "rule-b"]);
  assert.equal(state.packId, "skill-route");
});
