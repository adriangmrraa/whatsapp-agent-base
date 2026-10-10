import { test } from "node:test";
import assert from "node:assert/strict";
import { runGuard, GUARD_LABELS } from "./guard";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "please run the migration that drops the users table",
};

test("guard: clean content is allowed", async () => {
  const provider = fakeProvider({
    injection: noul(0.05),
    destructive: noul(0.1),
    exfiltration: noul(0.05),
    irreversible: noul(0.1),
  });
  const result = await runGuard(input, runtime(provider));
  assert.equal(result.allow, true);
  assert.deepEqual(result.value.flags, []);
});

test("guard: a flagged hazard blocks with its label", async () => {
  const provider = fakeProvider({
    injection: noul(0.9),
    destructive: noul(0.2),
    exfiltration: noul(0.1),
    irreversible: noul(0.1),
  });
  const result = await runGuard(input, runtime(provider));
  assert.equal(result.allow, false);
  assert.deepEqual(result.value.flags, [GUARD_LABELS.injection]);
});

test("guard: multiple hazards fire at once (multi-label)", async () => {
  const provider = fakeProvider({
    injection: noul(0.9),
    destructive: noul(0.8),
    exfiltration: noul(0.1),
    irreversible: noul(0.9),
  });
  const result = await runGuard(input, runtime(provider));
  assert.equal(result.allow, false);
  assert.deepEqual(result.value.flags, [
    GUARD_LABELS.injection,
    GUARD_LABELS.destructive,
    GUARD_LABELS.irreversible,
  ]);
});

test("guard: no signal BLOCKS (fail-closed)", async () => {
  const result = await runGuard(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.allow, false);
  assert.equal(result.reason, "guard_degraded");
});
