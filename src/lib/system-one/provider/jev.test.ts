import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevProvider } from "./jev";
import {
  DecisionProviderError,
  type NoulQuestion,
  type ChoiceQuestion,
  type ScoreQuestion,
} from "./types";

const questions = {
  risky: { type: "noul", instructions: "Is this destructive?" } as NoulQuestion,
  route: {
    type: "choice",
    instructions: "Pick a model tier.",
    criteria: { cheap: "small", mid: "medium", frontier: "large" },
  } as ChoiceQuestion,
  load: {
    type: "score",
    instructions: "How large is the change?",
    criteria: ["trivial", "small", "medium", "large", "huge"],
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

test("jev: sends the real contract and parses typed answers", async () => {
  const { fetchFn, calls } = mockFetch(() =>
    new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          risky: { type: "noul", noul: 0.82 },
          route: {
            type: "choice",
            choice: "mid",
            confidence: 0.7,
            probabilities: { cheap: 0.1, mid: 0.7, frontier: 0.2 },
          },
          load: { type: "score", score: 3, legend: { 0: 0.05 } },
        },
        usage: { input_tokens: 900, output_tokens: 12 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  const provider = createJevProvider({ apiKey: "secret-key", fetchFn });
  const answers = await provider.decide({ task: "x" }, questions);

  const [call] = calls;
  assert.equal(call.url, "https://api.typesafe.ai/v1/systemone");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer secret-key");
  const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
  assert.equal(body.model, "jev-latest");
  assert.deepEqual(body.questions, questions);

  assert.deepEqual(answers.risky, { type: "noul", noul: 0.82 });
  assert.equal(answers.route.type, "choice");
  assert.equal((answers.route as { choice: string }).choice, "mid");
  assert.equal(answers.load.type, "score");
  assert.equal((answers.load as { score: number }).score, 3);
});

test("jev: missing answer throws missing_answer", async () => {
  const { fetchFn } = mockFetch(
    () =>
      new Response(JSON.stringify({ answers: { risky: { type: "noul", noul: 1 } } }), {
        status: 200,
      }),
  );
  const provider = createJevProvider({ apiKey: "k", fetchFn });
  await assert.rejects(
    () => provider.decide("s", questions),
    (error: unknown) =>
      error instanceof DecisionProviderError && error.code === "missing_answer",
  );
});

test("jev: non-2xx throws http_error with status", async () => {
  const { fetchFn } = mockFetch(() => new Response("nope", { status: 502 }));
  const provider = createJevProvider({ apiKey: "k", fetchFn });
  await assert.rejects(
    () => provider.decide("s", questions),
    (error: unknown) =>
      error instanceof DecisionProviderError &&
      error.code === "http_error" &&
      error.status === 502,
  );
});

test("jev: invalid JSON throws malformed_response", async () => {
  const { fetchFn } = mockFetch(() => new Response("<html>", { status: 200 }));
  const provider = createJevProvider({ apiKey: "k", fetchFn });
  await assert.rejects(
    () => provider.decide("s", questions),
    (error: unknown) =>
      error instanceof DecisionProviderError && error.code === "malformed_response",
  );
});

test("jev: choice outside criteria fails closed", async () => {
  const { fetchFn } = mockFetch(
    () =>
      new Response(
        JSON.stringify({ answers: { route: { type: "choice", choice: "bogus" } } }),
        { status: 200 },
      ),
  );
  const provider = createJevProvider({ apiKey: "k", fetchFn });
  await assert.rejects(
    () => provider.decide("s", { route: questions.route }),
    (error: unknown) =>
      error instanceof DecisionProviderError && error.code === "malformed_response",
  );
});

test("jev: empty api key is not_configured", async () => {
  const provider = createJevProvider({ apiKey: "" });
  await assert.rejects(
    () => provider.decide("s", questions),
    (error: unknown) =>
      error instanceof DecisionProviderError && error.code === "not_configured",
  );
});
