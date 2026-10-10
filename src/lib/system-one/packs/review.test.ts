import { test } from "node:test";
import assert from "node:assert/strict";
import { runReview } from "./review";
import { fakeProvider, noSignalProvider, noul, runtime, score } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "review the diff" };

test("review: flags weak dimensions and a blocking issue", async () => {
  const provider = fakeProvider({
    correctness: score(1),
    specFit: score(4),
    testGap: score(2),
    radius: score(4),
    blocking: noul(0.9),
  });
  const result = await runReview(input, runtime(provider));
  assert.deepEqual(result.value.weak, ["correctness", "testGap"]);
  assert.equal(result.value.blocking, true);
  assert.equal(result.allow, true);
});

test("review: strong dimensions and no blocking issue", async () => {
  const provider = fakeProvider({
    correctness: score(4),
    specFit: score(4),
    testGap: score(3),
    radius: score(3),
    blocking: noul(0.1),
  });
  const result = await runReview(input, runtime(provider));
  assert.deepEqual(result.value.weak, []);
  assert.equal(result.value.blocking, false);
});

test("review: no signal reports no scores and no blocking (fail-open)", async () => {
  const result = await runReview(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.blocking, false);
  assert.deepEqual(result.value.weak, []);
  assert.equal(result.allow, true);
});
