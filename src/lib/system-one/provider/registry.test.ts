import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDecisionProvider } from "./registry";
import { isNoAnswer, type NoulQuestion } from "./types";

const questions = {
  go: { type: "noul", instructions: "Proceed?" } as NoulQuestion,
};

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("registry: no config → rules provider", () => {
  const provider = resolveDecisionProvider({ env: {} });
  assert.equal(provider.name, "rules");
});

test("registry: jev selected by env without a key degrades to rules", () => {
  const provider = resolveDecisionProvider({ env: { DECISION_ENGINE: "jev" } });
  assert.equal(provider.name, "rules");
});

test("registry: explicit jev with key and injected fetch succeeds", async () => {
  const provider = resolveDecisionProvider({
    provider: "jev",
    apiKey: "k",
    env: {},
    fetchFn: jsonFetch({ answers: { go: { type: "noul", noul: 0.9 } } }),
  });
  assert.equal(provider.name, "jev");
  const answers = await provider.decide("s", questions);
  assert.deepEqual(answers.go, { type: "noul", noul: 0.9 });
});

test("registry: network failure falls back to rules (NoAnswer)", async () => {
  const failing = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  const provider = resolveDecisionProvider({
    provider: "jev",
    apiKey: "k",
    env: {},
    breaker: false,
    fetchFn: failing,
  });
  const answers = await provider.decide("s", questions);
  assert.ok(isNoAnswer(answers.go));
});

test("registry: openai-decisions resolvable from OPENAI_API_KEY", () => {
  const provider = resolveDecisionProvider({
    env: { DECISION_ENGINE: "openai", OPENAI_API_KEY: "sk-test" },
  });
  assert.equal(provider.name, "openai-decisions");
});

test("registry: explicit config beats env", () => {
  const provider = resolveDecisionProvider({
    provider: "rules",
    apiKey: "sk-test",
    env: { DECISION_ENGINE: "openai", OPENAI_API_KEY: "sk-test" },
  });
  assert.equal(provider.name, "rules");
});
