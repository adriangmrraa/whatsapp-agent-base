import { test } from "node:test";
import assert from "node:assert/strict";
import { runContextPrime } from "./context-prime";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "fix the billing bug",
  candidates: [
    { id: "mem-1", kind: "memory", text: "billing rules" },
    { id: "mem-2", kind: "memory", text: "unrelated" },
    { id: "mem-3", kind: "memory", text: "more billing" },
  ],
};

test("context-prime: keeps candidates above the relevance threshold", async () => {
  const provider = fakeProvider({
    coverage: noul(0.8),
    select_0: noul(0.9),
    select_1: noul(0.1),
    select_2: noul(0.5),
  });
  const result = await runContextPrime(input, runtime(provider));
  assert.deepEqual(result.value.selected, ["mem-1", "mem-3"]);
  assert.deepEqual(result.value.omitted, ["mem-2"]);
  assert.equal(result.value.insufficient, false);
  assert.equal(result.allow, true);
});

test("context-prime: flags insufficient coverage", async () => {
  const provider = fakeProvider({
    coverage: noul(0.2),
    select_0: noul(0.9),
    select_1: noul(0.1),
    select_2: noul(0.1),
  });
  const result = await runContextPrime(input, runtime(provider));
  assert.equal(result.value.insufficient, true);
});

test("context-prime: no signal keeps every candidate (fail-open)", async () => {
  const result = await runContextPrime(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.deepEqual(result.value.selected, ["mem-1", "mem-2", "mem-3"]);
  assert.deepEqual(result.value.omitted, []);
  assert.equal(result.allow, true);
});
