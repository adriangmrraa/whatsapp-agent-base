import { test } from "node:test";
import assert from "node:assert/strict";
import { runTriage, TRIAGE_FALLBACK } from "./triage";
import {
  choice,
  fakeProvider,
  noSignalProvider,
  noul,
  runtime,
} from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "TypeError at session-router.ts:42 after the diff",
};

test("triage: classifies a real regression as blocking", async () => {
  const provider = fakeProvider({
    cause: choice("regression"),
    blocking: noul(0.8),
    rerunable: noul(0.1),
  });
  const result = await runTriage(input, runtime(provider));
  assert.equal(result.value.cause, "regression");
  assert.equal(result.value.blocking, true);
  assert.equal(result.value.rerun, false);
  assert.equal(result.allow, true);
});

test("triage: unknown cause falls back", async () => {
  const provider = fakeProvider({
    cause: choice("no-such-cause"),
    blocking: noul(0.1),
    rerunable: noul(0.9),
  });
  const result = await runTriage(input, runtime(provider));
  assert.equal(result.value.cause, TRIAGE_FALLBACK);
  assert.equal(result.value.rerun, true);
});

test("triage: no signal reports unknown and does not block (fail-open)", async () => {
  const result = await runTriage(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.cause, TRIAGE_FALLBACK);
  assert.equal(result.value.blocking, false);
  assert.equal(result.allow, true);
});
