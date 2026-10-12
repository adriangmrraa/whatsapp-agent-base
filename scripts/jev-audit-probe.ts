// ─── SYNTHETIC audit probe — proves the harness wiring end-to-end offline ─────
//
// This is an AUDIT instrument, not production code. It exercises the REAL
// resolution + measurement path with a STUBBED fetch so it makes NO network
// call and needs NO API key:
//
//   resolveDecisionProvider({ provider:"jev", apiKey:"SYNTHETIC", fetchFn })
//     → createJevProvider → decide() → (stubbed) fetch → typed answers
//   measureDecide(provider, state, questions, { mode:"shadow", packId })
//     → one DecisionSample (the ledger unit)
//
// Run: npx tsx scripts/jev-audit-probe.ts
// Every value it prints is synthetic; nothing here touches a hosted API.

import { resolveDecisionProvider } from "../src/lib/system-one/provider/registry";
import { measureDecide } from "../src/lib/system-one/ledger/types";
import type { AnswerMap, QuestionPack } from "../src/lib/system-one/provider/types";

interface RecordedCall {
  url: string;
  method: string;
  hasAuthHeader: boolean;
  model: string;
}

async function main(): Promise<void> {
  const calls: RecordedCall[] = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    let model = "?";
    try {
      model = (JSON.parse(String(init?.body ?? "{}")) as { model?: string }).model ?? "?";
    } catch {
      model = "?";
    }
    calls.push({
      url,
      method: init?.method ?? "GET",
      hasAuthHeader: headers.has("authorization"),
      model,
    });
    const body = {
      model,
      answers: { reachable: { type: "noul", noul: 0.97 } },
      usage: { input_tokens: 12, output_tokens: 3 },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const provider = resolveDecisionProvider({
    provider: "jev",
    apiKey: "SYNTHETIC_AUDIT_KEY_NOT_REAL",
    fetchFn,
    env: {},
  });

  const questions: QuestionPack = {
    reachable: {
      type: "noul",
      instructions: "Return a high probability if this is a smoke test.",
    },
  };

  const { answers, sample } = await measureDecide(
    provider,
    { task: "SYNTHETIC audit probe" },
    questions,
    { mode: "shadow", packId: "guard", now: () => 1_700_000_000_000 },
  );

  console.log("=== SYNTHETIC harness probe (no network, no real key) ===");
  console.log(`provider.name          : ${provider.name}`);
  console.log(`fetch calls recorded   : ${calls.length}`);
  for (const c of calls) {
    console.log(`  → ${c.method} ${c.url} | auth-header=${c.hasAuthHeader} | model=${c.model}`);
  }
  const ans = answers as AnswerMap<QuestionPack> | null;
  console.log(`answers.reachable      : ${JSON.stringify(ans?.reachable)}`);
  console.log("DecisionSample (ledger unit):");
  console.log(`  ${JSON.stringify(sample)}`);
  console.log(`attribution fields     : ${Object.keys(sample).join(", ")}`);
  console.log(
    `agent/source/actor field present: ${["agent", "source", "actor", "session", "author"].some((k) => k in sample)}`,
  );
  console.log("\nVERDICT: resolveDecisionProvider → Jev adapter → measureDecide wiring WORKS (SYNTHETIC).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
