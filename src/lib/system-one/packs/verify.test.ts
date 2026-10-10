import { test } from "node:test";
import assert from "node:assert/strict";
import { runVerify, VERIFY_FALLBACK } from "./verify";
import {
  choice,
  fakeProvider,
  noSignalProvider,
  noul,
  runtime,
} from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "claim: build passes" };

test("verify: supported claim with test evidence", async () => {
  const provider = fakeProvider({
    evidence: noul(0.9),
    matches: noul(0.9),
    external: choice("tests"),
  });
  const result = await runVerify(input, runtime(provider));
  assert.equal(result.value.supported, true);
  assert.equal(result.value.evidenceType, "tests");
  assert.equal(result.value.advisoryOnly, true);
  assert.equal(result.allow, true);
});

test("verify: unknown evidence type falls back to none", async () => {
  const provider = fakeProvider({
    evidence: noul(0.2),
    matches: noul(0.2),
    external: choice("crystal-ball"),
  });
  const result = await runVerify(input, runtime(provider));
  assert.equal(result.value.evidenceType, VERIFY_FALLBACK);
  assert.equal(result.value.supported, false);
});

test("verify: no signal reports unsupported but never blocks (advisory)", async () => {
  const result = await runVerify(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.supported, false);
  assert.equal(result.value.evidenceType, VERIFY_FALLBACK);
  assert.equal(result.allow, true);
});
