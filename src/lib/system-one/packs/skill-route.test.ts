import { test } from "node:test";
import assert from "node:assert/strict";
import { runSkillRoute, SKILL_ROUTE_FALLBACK } from "./skill-route";
import {
  choice,
  fakeProvider,
  noSignalProvider,
  noul,
  runtime,
} from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "write a new SDD change",
  candidates: [
    { id: "sdd-propose", kind: "skill", text: "write a proposal" },
    { id: "video-produccion", kind: "skill", text: "make a video" },
  ],
};

test("skill-route: selects applicable skills and a primary", async () => {
  const provider = fakeProvider({
    skill_0: noul(0.9),
    skill_1: noul(0.1),
    primary: choice("sdd-propose"),
  });
  const result = await runSkillRoute(input, runtime(provider));
  assert.deepEqual(result.value.skills, ["sdd-propose"]);
  assert.equal(result.value.primary, "sdd-propose");
  assert.equal(result.allow, true);
});

test("skill-route: unknown primary falls back to none", async () => {
  const provider = fakeProvider({
    skill_0: noul(0.9),
    skill_1: noul(0.9),
    primary: choice("not-a-skill"),
  });
  const result = await runSkillRoute(input, runtime(provider));
  assert.equal(result.value.primary, SKILL_ROUTE_FALLBACK);
  assert.deepEqual(result.value.skills, ["sdd-propose", "video-produccion"]);
});

test("skill-route: no signal routes to none (fail-open)", async () => {
  const result = await runSkillRoute(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.deepEqual(result.value.skills, []);
  assert.equal(result.value.primary, SKILL_ROUTE_FALLBACK);
  assert.equal(result.allow, true);
});
