import { test } from "node:test";
import assert from "node:assert/strict";
import { runScopeGuard, SCOPE_GUARD_FLAGS } from "./scope-guard";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "add tenant filter only" };

test("scope-guard: an in-scope diff is allowed", async () => {
  const provider = fakeProvider({
    inScope: noul(0.9),
    newPaths: noul(0.1),
    unrelated: noul(0.1),
  });
  const result = await runScopeGuard(input, runtime(provider));
  assert.equal(result.allow, true);
  assert.deepEqual(result.value.drifts, []);
});

test("scope-guard: out-of-scope work blocks with a drift label", async () => {
  const provider = fakeProvider({
    inScope: noul(0.2),
    newPaths: noul(0.9),
    unrelated: noul(0.1),
  });
  const result = await runScopeGuard(input, runtime(provider));
  assert.equal(result.allow, false);
  assert.deepEqual(result.value.drifts, [
    SCOPE_GUARD_FLAGS.outOfScope,
    SCOPE_GUARD_FLAGS.newPaths,
  ]);
});

test("scope-guard: no signal BLOCKS (fail-closed)", async () => {
  const result = await runScopeGuard(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.allow, false);
  assert.equal(result.reason, "scope_guard_degraded");
});
