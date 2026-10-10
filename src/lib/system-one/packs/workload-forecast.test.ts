import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runWorkloadForecast,
  GUARD_CHAINED_LINE,
  GUARD_DECISION_LINE,
} from "./workload-forecast";
import { fakeProvider, noSignalProvider, noul, runtime, score } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "add chained onboarding" };

test("workload-forecast: emits both exact guard lines", async () => {
  const provider = fakeProvider({
    size: score(3),
    chained: noul(0.8),
    decisionNeeded: noul(0.6),
  });
  const result = await runWorkloadForecast(input, runtime(provider));
  assert.equal(result.value.sizeScore, 3);
  assert.equal(result.value.sizeLabel, "large (300-400 changed lines)");
  assert.equal(result.value.chained, true);
  assert.equal(result.value.decisionNeeded, true);
  assert.deepEqual(result.value.guardLines, [GUARD_DECISION_LINE, GUARD_CHAINED_LINE]);
});

test("workload-forecast: small, decided change emits no guard lines", async () => {
  const provider = fakeProvider({
    size: score(0),
    chained: noul(0.1),
    decisionNeeded: noul(0.1),
  });
  const result = await runWorkloadForecast(input, runtime(provider));
  assert.equal(result.value.chained, false);
  assert.deepEqual(result.value.guardLines, []);
});

test("workload-forecast: no signal emits no guard lines (fail-open)", async () => {
  const result = await runWorkloadForecast(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.deepEqual(result.value.guardLines, []);
  assert.equal(result.allow, true);
});
