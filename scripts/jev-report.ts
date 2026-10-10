import { readFileSync } from "node:fs";
import {
  aggregate,
  evaluateGate,
  formatAbReport,
  formatStatsReport,
  runAb,
  type AbTask,
  type DecisionSample,
} from "../src/lib/system-one/ledger";
import type {
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../src/lib/system-one/provider/types";

// ─── `npm run jev:report` ────────────────────────────────────────────────────
//
// Two modes:
//   --in <path>   aggregate a JSON array of DecisionSample recorded elsewhere
//                 (the harness writes these; shadow or A/B both qualify).
//   (default)     run a self-contained, offline A/B fixture with mocked
//                 providers, so the report is demonstrable with no API key and
//                 no network — mirroring the fixture tests.
//
// Nothing here touches a hosted API or a real key.

function usage(): string {
  return [
    "Usage:",
    "  npm run jev:report                # offline A/B fixture + gate",
    "  npm run jev:report -- --in <file> # aggregate a DecisionSample[] JSON file",
  ].join("\n");
}

/** A deterministic mock provider: returns the same typed answer for each id. */
function fixtureProvider(name: string): DecisionProvider {
  return {
    name,
    async decide<T extends QuestionPack>(
      _state: State,
      questions: T,
    ): Promise<AnswerMap<T>> {
      const out: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(questions)) {
        if (question.type === "noul") {
          out[id] = { type: "noul", noul: 0.9 };
        } else if (question.type === "choice") {
          out[id] = { type: "choice", choice: Object.keys(question.criteria)[0] };
        } else {
          out[id] = { type: "score", score: question.criteria.length - 1 };
        }
      }
      return out as AnswerMap<T>;
    },
  };
}

const questions: QuestionPack = {
  risky: { type: "noul", instructions: "Is this change destructive?" },
};

const fullContext: State = { task: "x", files: "y".repeat(4_000) };

const fixtureTasks: AbTask[] = [
  {
    id: "primed-small",
    state: fullContext,
    candidateState: { task: "x", files: "y".repeat(200) },
    questions,
    expected: { risky: { type: "noul", noul: 0.9 } },
  },
  {
    id: "primed-medium",
    state: fullContext,
    candidateState: { task: "x", files: "y".repeat(1_000) },
    questions,
    expected: { risky: { type: "noul", noul: 0.9 } },
  },
  {
    id: "expanded-waste",
    state: { task: "x", files: "y".repeat(200) },
    candidateState: { task: "x", files: "y".repeat(6_000) },
    questions,
    expected: { risky: { type: "noul", noul: 0.9 } },
  },
];

async function reportFromFile(path: string): Promise<void> {
  const raw = readFileSync(path, "utf8");
  const samples = JSON.parse(raw) as DecisionSample[];
  console.log(formatStatsReport(aggregate(samples)));
}

async function reportFromFixture(): Promise<void> {
  const result = await runAb({
    packId: "context-prime",
    baseline: fixtureProvider("openai-decisions"),
    candidate: fixtureProvider("jev"),
    tasks: fixtureTasks,
  });

  console.log(formatAbReport(result));
  console.log("");
  const gate = evaluateGate(result);
  console.log(
    `gate: ${gate.pass ? "PASS — activate" : "FAIL — keep in shadow"}`,
  );
  for (const reason of gate.reasons) console.log(`  - ${reason}`);

  const samples: DecisionSample[] = result.tasks.flatMap((t) => [
    t.baseline,
    t.candidate,
  ]);
  console.log("");
  console.log(formatStatsReport(aggregate(samples)));
}

async function main(): Promise<void> {
  const inIndex = process.argv.indexOf("--in");
  if (inIndex !== -1) {
    const path = process.argv[inIndex + 1];
    if (!path) {
      console.error("Missing path after --in\n");
      console.error(usage());
      process.exitCode = 2;
      return;
    }
    await reportFromFile(path);
    return;
  }
  await reportFromFixture();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
