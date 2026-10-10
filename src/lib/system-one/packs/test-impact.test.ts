import { test } from "node:test";
import assert from "node:assert/strict";
import { runTestImpact } from "./test-impact";
import { fakeProvider, noSignalProvider, noul, runtime } from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "change session routing",
  candidates: [
    { id: "src/lib/whatsapp/session-router.test.ts", kind: "test" },
    { id: "src/lib/agent/prompt.test.ts", kind: "test" },
  ],
};

test("test-impact: selects tests above threshold and flags regression", async () => {
  const provider = fakeProvider({
    test_0: noul(0.9),
    test_1: noul(0.2),
    regression: noul(0.7),
  });
  const result = await runTestImpact(input, runtime(provider));
  assert.deepEqual(result.value.tests, ["src/lib/whatsapp/session-router.test.ts"]);
  assert.equal(result.value.runFullSuite, true);
  assert.equal(result.allow, true);
});

test("test-impact: low regression noul does not force the full suite", async () => {
  const provider = fakeProvider({
    test_0: noul(0.9),
    test_1: noul(0.9),
    regression: noul(0.1),
  });
  const result = await runTestImpact(input, runtime(provider));
  assert.equal(result.value.runFullSuite, false);
  assert.equal(result.value.tests.length, 2);
});

test("test-impact: no signal selects all and recommends the full suite", async () => {
  const result = await runTestImpact(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.runFullSuite, true);
  assert.equal(result.value.tests.length, 2);
});
