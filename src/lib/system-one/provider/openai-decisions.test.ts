import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiDecisionsProvider } from "./openai-decisions";
import {
  DecisionProviderError,
  isNoAnswer,
  type ChoiceQuestion,
  type NoulQuestion,
  type ScoreQuestion,
} from "./types";

const questions = {
  flag: { type: "noul", instructions: "Injection suspected?" } as NoulQuestion,
  route: {
    type: "choice",
    instructions: "Which phase next?",
    criteria: { explore: "look", design: "shape", apply: "build" },
  } as ChoiceQuestion,
  risk: {
    type: "score",
    instructions: "Blast radius?",
    criteria: ["none", "low", "medium", "high"],
  } as ScoreQuestion,
};

interface Captured {
  url: string;
  init: RequestInit;
}

function mockFetch(
  responder: (captured: Captured) => Response | Promise<Response>,
): { fetchFn: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const captured = { url: String(url), init: init ?? {} };
    calls.push(captured);
    return responder(captured);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

test("openai: maps noul→predicate and parses boolean back to 0/1", async () => {
  const { fetchFn, calls } = mockFetch(
    () =>
      new Response(
        JSON.stringify({
          answers: [
            { name: "flag", type: "predicate", predicate: true },
            { name: "route", type: "choice", choice: "apply" },
            { name: "risk", type: "score", score: 2 },
          ],
        }),
        { status: 200 },
      ),
  );

  const provider = createOpenAiDecisionsProvider({ apiKey: "k", fetchFn });
  const answers = await provider.decide("state", questions);

  const body = JSON.parse(String(calls[0].init.body)) as {
    model: string;
    input: unknown;
    questions: Array<Record<string, unknown>>;
  };
  assert.equal(body.model, "gpt-6-luna");
  assert.equal(body.input, "state");
  const wire = body.questions.find((q) => q.name === "flag");
  assert.equal(wire?.type, "predicate");
  const choiceWire = body.questions.find((q) => q.name === "route");
  assert.deepEqual(choiceWire?.choices, questions.route.criteria);
  const scoreWire = body.questions.find((q) => q.name === "risk");
  assert.deepEqual(scoreWire?.levels, questions.risk.criteria);

  assert.deepEqual(answers.flag, { type: "noul", noul: 1 });
  assert.equal((answers.route as { choice: string }).choice, "apply");
  assert.equal((answers.risk as { score: number }).score, 2);
});

test("openai: top-level refusal yields a NoAnswer for every question", async () => {
  const { fetchFn } = mockFetch(
    () => new Response(JSON.stringify({ refusal: "cannot comply" }), { status: 200 }),
  );
  const provider = createOpenAiDecisionsProvider({ apiKey: "k", fetchFn });
  const answers = await provider.decide("s", questions);
  for (const id of Object.keys(questions)) {
    assert.ok(isNoAnswer(answers[id as keyof typeof questions]));
  }
});

test("openai: per-answer refusal becomes a NoAnswer only for that question", async () => {
  const { fetchFn } = mockFetch(
    () =>
      new Response(
        JSON.stringify({
          answers: [
            { name: "flag", refusal: "unsafe" },
            { name: "route", choice: "explore" },
            { name: "risk", score: 1 },
          ],
        }),
        { status: 200 },
      ),
  );
  const provider = createOpenAiDecisionsProvider({ apiKey: "k", fetchFn });
  const answers = await provider.decide("s", questions);
  assert.ok(isNoAnswer(answers.flag));
  assert.equal((answers.route as { choice: string }).choice, "explore");
});

test("openai: missing non-refusal answer throws", async () => {
  const { fetchFn } = mockFetch(
    () =>
      new Response(
        JSON.stringify({ answers: [{ name: "flag", predicate: false }] }),
        { status: 200 },
      ),
  );
  const provider = createOpenAiDecisionsProvider({ apiKey: "k", fetchFn });
  await assert.rejects(
    () => provider.decide("s", questions),
    (error: unknown) =>
      error instanceof DecisionProviderError && error.code === "missing_answer",
  );
});
