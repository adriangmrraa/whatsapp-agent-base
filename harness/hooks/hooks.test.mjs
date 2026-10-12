// ─── JEV hooks — self-contained tests (node:test, no deps) ───────────────────
//
// Run with:  node --test harness/hooks/
// Plain ESM; excluded from the app's tsc (harness/*.mjs) and from `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bandsFor, DEFAULT_BANDS } from "./bands.mjs";
import { evaluateStop } from "./stop-done.mjs";
import { toolActionText as gateActionText } from "./gate-pretool.mjs";
import { toolActionText as pluginActionText } from "./opencode-plugin.mjs";

test("bands: default 0.9 auto / 0.5 flag, ordered", () => {
  assert.deepEqual(DEFAULT_BANDS, { auto: 0.9, flag: 0.5 });
  const b = bandsFor("verify");
  assert.deepEqual(b, { auto: 0.9, flag: 0.5 });
  assert.ok(b.auto >= b.flag);
});

test("stop: strong evidence stops", () => {
  const r = evaluateStop({ evidenceExitCode: 0, verifyNoul: 0.95, attempts: 1, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "stop");
});

test("stop: mid evidence stops but flags for review", () => {
  const r = evaluateStop({ evidenceExitCode: 0, verifyNoul: 0.7, attempts: 1, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "review");
});

test("stop: weak evidence blocks", () => {
  const r = evaluateStop({ evidenceExitCode: 0, verifyNoul: 0.3, attempts: 1, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "block");
});

test("stop: failing evidence command always blocks (<0.5)", () => {
  const r = evaluateStop({ evidenceExitCode: 1, verifyNoul: 0.99, attempts: 1, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "block");
  assert.equal(r.score, 0);
});

test("stop: no verify signal + passing checks stops (advisory pack)", () => {
  const r = evaluateStop({ evidenceExitCode: 0, verifyNoul: undefined, attempts: 1, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "stop");
});

test("stop: turn-cap in code stops regardless", () => {
  const r = evaluateStop({ evidenceExitCode: 1, verifyNoul: 0, attempts: 8, maxTurns: 8, bands: bandsFor("verify") });
  assert.equal(r.verdict, "stop");
  assert.match(r.reason, /turn cap/);
});

test("hook: tool action text flattening", () => {
  assert.equal(gateActionText("Bash", { command: "rm -rf /" }), "rm -rf /");
  assert.equal(gateActionText("Write", { filePath: "a.ts" }), "Write a.ts");
  assert.equal(pluginActionText("bash", { command: "ls" }), "ls");
  assert.equal(pluginActionText("edit", { file_path: "b.ts" }), "edit b.ts");
});
