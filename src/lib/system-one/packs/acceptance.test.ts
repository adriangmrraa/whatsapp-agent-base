import { test } from "node:test";
import assert from "node:assert/strict";
import { runAcceptance } from "./acceptance";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "verify acceptance",
  candidates: [
    { id: "S1", kind: "scenario", text: "admin can list tenants" },
    { id: "S2", kind: "scenario", text: "tenant cannot read others" },
  ],
};

test("acceptance: maps scenario coverage and completeness", async () => {
  const provider = fakeProvider({
    cover_0: noul(0.9),
    cover_1: noul(0.1),
    complete: noul(0.3),
  });
  const result = await runAcceptance(input, runtime(provider));
  assert.deepEqual(result.value.covered, ["S1"]);
  assert.deepEqual(result.value.uncovered, ["S2"]);
  assert.equal(result.value.complete, false);
  assert.equal(result.allow, true);
});

test("acceptance: full coverage is complete", async () => {
  const provider = fakeProvider({
    cover_0: noul(0.9),
    cover_1: noul(0.9),
    complete: noul(0.9),
  });
  const result = await runAcceptance(input, runtime(provider));
  assert.equal(result.value.complete, true);
  assert.deepEqual(result.value.uncovered, []);
});

test("acceptance: no signal marks all uncovered (fail-open)", async () => {
  const result = await runAcceptance(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.deepEqual(result.value.covered, []);
  assert.deepEqual(result.value.uncovered, ["S1", "S2"]);
  assert.equal(result.allow, true);
});
