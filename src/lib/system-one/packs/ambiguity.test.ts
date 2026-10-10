import { test } from "node:test";
import assert from "node:assert/strict";
import { runAmbiguity, AMBIGUITY_REASONS } from "./ambiguity";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "make it better" };

test("ambiguity: a clear requirement proceeds", async () => {
  const provider = fakeProvider({
    ambiguous: noul(0.1),
    missingInfo: noul(0.1),
    contradictory: noul(0.05),
  });
  const result = await runAmbiguity(input, runtime(provider));
  assert.equal(result.allow, true);
  assert.equal(result.value.askHuman, false);
  assert.deepEqual(result.value.reasons, []);
});

test("ambiguity: an ambiguous requirement asks the human", async () => {
  const provider = fakeProvider({
    ambiguous: noul(0.8),
    missingInfo: noul(0.1),
    contradictory: noul(0.1),
  });
  const result = await runAmbiguity(input, runtime(provider));
  assert.equal(result.allow, false);
  assert.equal(result.value.askHuman, true);
  assert.deepEqual(result.value.reasons, [AMBIGUITY_REASONS.ambiguous]);
});

test("ambiguity: no signal ASKS THE HUMAN (fail-closed)", async () => {
  const result = await runAmbiguity(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.allow, false);
  assert.equal(result.value.askHuman, true);
  assert.equal(result.reason, "ambiguity_degraded");
});
