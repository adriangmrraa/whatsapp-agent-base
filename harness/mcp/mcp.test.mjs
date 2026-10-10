// ─── JEV harness MCP — self-contained tests (node:test, no deps) ──────────────
//
// Run with:  node --test harness/mcp/
// Kept out of the app's `npm test` on purpose (that glob is src/**/*.test.ts);
// this file is plain ESM so it is also excluded from `tsc`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createProvider, ProviderError } from "./provider.mjs";
import { PACKS, PACKS_BY_TOOL, applyPolicy, packQuestions, toolName } from "./packs.mjs";

const fakeResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

const jevConfig = (over = {}) => ({
  engine: "jev",
  model: "jev-test",
  baseUrl: "http://jev.test",
  timeoutMs: 100,
  apiKey: "test-key",
  ...over,
});

test("catalog: tool names are unique and jev_-prefixed", () => {
  const names = PACKS.map((p) => toolName(p.id));
  assert.equal(new Set(names).size, PACKS.length);
  for (const n of names) assert.match(n, /^jev_[a-z_]+$/);
  assert.equal(Object.keys(PACKS_BY_TOOL).length, PACKS.length);
});

test("catalog: each policy question exists in its questions (or any-noul list)", () => {
  for (const pack of PACKS) {
    const ids = pack.policy.kind === "any-noul" ? pack.policy.questions : [pack.policy.question];
    for (const id of ids) assert.ok(pack.questions[id], `${pack.id}: missing question "${id}"`);
  }
});

test("every choice question carries a fallback option", () => {
  for (const pack of PACKS) {
    const q = pack.questions[pack.policy.question];
    if (q?.type === "choice") {
      assert.ok("none" in q.criteria || q.criteria !== undefined, `${pack.id}: no fallback`);
    }
    if (pack.policy.kind === "choice") assert.equal(pack.policy.fallbackOption, "none");
  }
});

test("packQuestions: injects caller options and guarantees a none fallback", () => {
  const pack = PACKS_BY_TOOL.jev_skill_route;
  const q = packQuestions(pack, ["sdd-apply", "sdd-verify"]);
  const criteria = q.skill.criteria;
  assert.ok("sdd-apply" in criteria && "none" in criteria);
});

test("applyPolicy: open noul above threshold fires onTrue", () => {
  const pack = PACKS_BY_TOOL.jev_file_scope;
  const d = applyPolicy(pack, { touches: { type: "noul", noul: 0.9 } });
  assert.equal(d.allow, true);
  assert.equal(d.action, "in-scope");
});

test("applyPolicy: closed pack fails closed on no-answer", () => {
  const pack = PACKS_BY_TOOL.jev_ambiguity;
  const d = applyPolicy(pack, { ambiguous: { type: "no-answer", reason: "rules_fallback" } });
  assert.equal(d.allow, false);
  assert.match(d.reason, /no_answer/);
});

test("applyPolicy: any-noul guard blocks when any signal is high", () => {
  const pack = PACKS_BY_TOOL.jev_guard;
  const d = applyPolicy(pack, {
    destructive: { type: "noul", noul: 0.1 },
    injection: { type: "noul", noul: 0.8 },
    secret_exposure: { type: "noul", noul: 0.0 },
  });
  assert.equal(d.allow, false);
  assert.equal(d.action, "block");
  assert.match(d.reason, /injection/);
});

test("applyPolicy: choice below confidence threshold falls back to none", () => {
  const pack = PACKS_BY_TOOL.jev_test_impact;
  const d = applyPolicy(pack, { tests: { type: "choice", choice: "a.test.ts", confidence: 0.1 } });
  assert.equal(d.choice, "none");
  assert.match(d.reason, /low_confidence/);
});

test("jev provider: normalizes a batch of answers", async () => {
  const p = createProvider(jevConfig(), async () =>
    fakeResponse({
      answers: {
        q1: { type: "noul", noul: 0.42 },
        q2: { type: "choice", choice: "b", confidence: 0.7, probabilities: { a: 0.3, b: 0.7 } },
        q3: { type: "score", score: 3, probabilities: { 0: 0.1, 3: 0.9 } },
      },
    }),
  );
  const answers = await p.decide({ task: "x" }, {
    q1: { type: "noul", instructions: "yes?" },
    q2: { type: "choice", instructions: "pick", criteria: { a: "A", b: "B" } },
    q3: { type: "score", instructions: "rate", criteria: ["0", "1", "2", "3"] },
  });
  assert.equal(answers.q1.noul, 0.42);
  assert.equal(answers.q2.choice, "b");
  assert.equal(answers.q3.score, 3);
});

test("jev provider: malformed noul throws ProviderError(malformed_response)", async () => {
  const p = createProvider(jevConfig(), async () => fakeResponse({ answers: { q1: { type: "noul", noul: 2 } } }));
  await assert.rejects(
    () => p.decide("s", { q1: { type: "noul", instructions: "?" } }),
    (e) => e instanceof ProviderError && e.code === "malformed_response",
  );
});

test("jev provider: choice outside criteria throws", async () => {
  const p = createProvider(jevConfig(), async () => fakeResponse({ answers: { q1: { type: "choice", choice: "zzz" } } }));
  await assert.rejects(
    () => p.decide("s", { q1: { type: "choice", instructions: "?", criteria: { a: "A" } } }),
    (e) => e.code === "malformed_response",
  );
});

test("jev provider: missing api key throws not_configured", async () => {
  const p = createProvider(jevConfig({ apiKey: "" }), async () => fakeResponse({ answers: {} }));
  await assert.rejects(() => p.decide("s", {}), (e) => e.code === "not_configured");
});

test("rules provider: returns a no-answer for every question", async () => {
  const p = createProvider({ engine: "rules" });
  const answers = await p.decide("s", { q1: { type: "noul", instructions: "?" } });
  assert.equal(answers.q1.type, "no-answer");
});
