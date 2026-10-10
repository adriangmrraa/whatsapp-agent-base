import { test } from "node:test";
import assert from "node:assert/strict";
import { runPhaseRoute, PHASE_ROUTE_FALLBACK } from "./phase-route";
import {
  choice,
  fakeProvider,
  noSignalProvider,
  noul,
  runtime,
} from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = { task: "tasks are written and approved" };

test("phase-route: advances to apply when ready", async () => {
  const provider = fakeProvider({
    nextPhase: choice("apply"),
    ready: noul(0.8),
    blocked: noul(0.1),
  });
  const result = await runPhaseRoute(input, runtime(provider));
  assert.equal(result.value.nextPhase, "apply");
  assert.equal(result.value.ready, true);
  assert.equal(result.value.blocked, false);
  assert.equal(result.allow, true);
});

test("phase-route: unknown phase falls back to none", async () => {
  const provider = fakeProvider({
    nextPhase: choice("not-a-phase"),
    ready: noul(0.1),
    blocked: noul(0.9),
  });
  const result = await runPhaseRoute(input, runtime(provider));
  assert.equal(result.value.nextPhase, PHASE_ROUTE_FALLBACK);
  assert.equal(result.value.blocked, true);
});

test("phase-route: no signal routes to none (fail-open)", async () => {
  const result = await runPhaseRoute(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.equal(result.value.nextPhase, PHASE_ROUTE_FALLBACK);
  assert.equal(result.value.ready, false);
  assert.equal(result.allow, true);
});
