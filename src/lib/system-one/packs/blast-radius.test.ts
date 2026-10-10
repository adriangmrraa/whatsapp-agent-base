import { test } from "node:test";
import assert from "node:assert/strict";
import { runBlastRadius, BLAST_RADIUS_FLAGS } from "./blast-radius";
import { fakeProvider, noSignalProvider, noul, runtime, score } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "change the shared tenant resolver" };

test("blast-radius: a wide change raises risk flags", async () => {
  const provider = fakeProvider({
    radius: score(3),
    dependents: noul(0.8),
    publicApi: noul(0.7),
  });
  const result = await runBlastRadius(input, runtime(provider));
  assert.equal(result.value.radiusScore, 3);
  assert.equal(result.value.highRisk, true);
  assert.deepEqual(result.value.flags, [
    BLAST_RADIUS_FLAGS.wideRadius,
    BLAST_RADIUS_FLAGS.manyDependents,
    BLAST_RADIUS_FLAGS.publicApi,
  ]);
});

test("blast-radius: a local change raises no flags", async () => {
  const provider = fakeProvider({
    radius: score(0),
    dependents: noul(0.1),
    publicApi: noul(0.1),
  });
  const result = await runBlastRadius(input, runtime(provider));
  assert.equal(result.value.highRisk, false);
  assert.deepEqual(result.value.flags, []);
});

test("blast-radius: no signal reports no risk (fail-open)", async () => {
  const result = await runBlastRadius(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.highRisk, false);
  assert.deepEqual(result.value.flags, []);
  assert.equal(result.allow, true);
});
