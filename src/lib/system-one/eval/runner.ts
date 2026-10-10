import {
  aggregate,
  answerMapMatches,
  formatStatsReport,
  runShadow,
  ShadowLedger,
} from "../ledger";
import type { ContextPrimer } from "../context/primer";
import type {
  Answer,
  AnswerMap,
  DecisionProvider,
  QuestionPack,
  State,
} from "../provider/types";
import type { PackInput, PackResult, PackRuntime } from "../packs/types";
import {
  buildFileScopeQuestions,
  runFileScope,
  type FileScopeValue,
} from "../packs/file-scope";
import {
  buildWorkloadForecastQuestions,
  runWorkloadForecast,
  type WorkloadForecastValue,
} from "../packs/workload-forecast";
import {
  buildGuardQuestions,
  runGuard,
  type GuardValue,
} from "../packs/guard";
import type {
  GoldenCase,
  GoldenDecision,
  GoldenEvalOptions,
  GoldenEvalResult,
  GoldenFixture,
  GoldenPackId,
  GoldenSweepPoint,
} from "./types";

// ─── Golden eval runner ──────────────────────────────────────────────────────
//
// Runs the REAL pack functions against scripted answers and scores them against
// the golden decisions, using the Phase-4 ledger for the measurement:
//
//   - `answerMapMatches`  → answer-level agreement (answers vs golden answers)
//   - `runShadow`+sink    → one measured DecisionSample per fixture
//   - `aggregate`/report  → token/cost/latency stats for the whole run
//
// The optional `threshold` override reaches the packs through
// `PackInput.thresholdOverrides`, so a sweep moves the cutoff through the real
// pack logic — no forked decision code to drift from the packs.

const TOLERANCE = 0.1;

function scriptedProvider(map: Record<string, Answer>): DecisionProvider {
  return {
    name: "scripted",
    async decide<T extends QuestionPack>(
      _state: State,
      questions: T,
    ): Promise<AnswerMap<T>> {
      const out: Record<string, Answer> = {};
      for (const id of Object.keys(questions)) {
        out[id] = map[id] ?? { type: "no-answer", reason: "missing" };
      }
      return out as AnswerMap<T>;
    },
  };
}

/** A primer that echoes only the task — the real packs need no memory here. */
function echoPrimer(): ContextPrimer {
  return {
    async build(packId, input) {
      return {
        state: { task: input.task, packId },
        tokens: 1,
        memories: [],
        omittedMemories: 0,
        omittedCandidates: 0,
      };
    },
  };
}

function questionsFor(fixture: GoldenFixture): QuestionPack {
  switch (fixture.packId) {
    case "file-scope":
      return buildFileScopeQuestions(fixture.candidates ?? []);
    case "workload-forecast":
      return buildWorkloadForecastQuestions();
    case "guard":
      return buildGuardQuestions(fixture.task);
  }
}

function overridesFor(
  packId: GoldenPackId,
  threshold: number | undefined,
  scoreThreshold: number | undefined,
): Readonly<Record<string, number>> | undefined {
  if (threshold === undefined && scoreThreshold === undefined) return undefined;
  const overrides: Record<string, number> = {};
  if (threshold !== undefined) {
    if (packId === "file-scope") {
      overrides.fileMin = threshold;
      overrides.coveredMin = threshold;
    } else if (packId === "workload-forecast") {
      overrides.chainedMin = threshold;
      overrides.decisionMin = threshold;
    } else {
      overrides.injectionMin = threshold;
      overrides.destructiveMin = threshold;
      overrides.exfiltrationMin = threshold;
      overrides.irreversibleMin = threshold;
    }
  }
  if (scoreThreshold !== undefined && packId === "workload-forecast") {
    overrides.sizeWarn = scoreThreshold;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function runPack(
  fixture: GoldenFixture,
  provider: DecisionProvider,
  overrides: Readonly<Record<string, number>> | undefined,
): Promise<PackResult<unknown>> {
  const input: PackInput = {
    task: fixture.task,
    candidates: fixture.candidates,
    thresholdOverrides: overrides,
  };
  const runtime: PackRuntime = { primer: echoPrimer(), provider };
  switch (fixture.packId) {
    case "file-scope":
      return runFileScope(input, runtime);
    case "workload-forecast":
      return runWorkloadForecast(input, runtime);
    case "guard":
      return runGuard(input, runtime);
  }
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const set = new Set(expected);
  return actual.every((value) => set.has(value));
}

function sameOrder(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function decisionMatches(
  packId: GoldenPackId,
  decision: GoldenDecision,
  value: unknown,
): boolean {
  if (packId === "guard" && decision.packId === "guard") {
    return sameSet((value as GuardValue).flags, decision.flags);
  }
  if (packId === "file-scope" && decision.packId === "file-scope") {
    const v = value as FileScopeValue;
    return (
      v.folder === decision.folder &&
      v.incomplete === decision.incomplete &&
      sameSet(v.files, decision.files)
    );
  }
  if (packId === "workload-forecast" && decision.packId === "workload-forecast") {
    const v = value as WorkloadForecastValue;
    return (
      v.chained === decision.chained &&
      v.decisionNeeded === decision.decisionNeeded &&
      sameOrder(v.guardLines, decision.guardLines)
    );
  }
  return false;
}

function escalated(packId: GoldenPackId, result: PackResult<unknown>): boolean {
  if (packId === "guard") return result.allow === false;
  if (packId === "file-scope") return (result.value as FileScopeValue).incomplete;
  return (result.value as WorkloadForecastValue).guardLines.length > 0;
}

/**
 * Evaluate the golden fixtures at a threshold and report agreement/escalation.
 * Pure over `{ fixtures, threshold }` plus the injected clock; never touches the
 * network (the provider is scripted) and never throws on a pack decision.
 */
export async function runGoldenEval(
  options: GoldenEvalOptions,
): Promise<GoldenEvalResult> {
  const tolerance = options.tolerance ?? TOLERANCE;
  const now = options.now ?? Date.now;
  const sink = new ShadowLedger();
  const cases: GoldenCase[] = [];

  for (const fixture of options.fixtures) {
    const provider = scriptedProvider(fixture.answers);
    const overrides = overridesFor(
      fixture.packId,
      options.threshold,
      options.scoreThreshold,
    );
    const result = await runPack(fixture, provider, overrides);
    const shadow = await runShadow(provider, { task: fixture.task }, questionsFor(fixture), {
      packId: fixture.packId,
      now,
      sink,
    });
    const golden = (fixture.expected ?? fixture.answers) as AnswerMap<QuestionPack>;

    cases.push({
      id: fixture.id,
      packId: fixture.packId,
      answerAgree: answerMapMatches(shadow.answers, golden, tolerance),
      decisionMatch: decisionMatches(fixture.packId, fixture.decision, result.value),
      escalate: escalated(fixture.packId, result),
      expectedEscalate: fixture.escalate,
      sample: shadow.sample,
    });
  }

  const total = cases.length;
  const escalations = cases.filter((item) => item.escalate).length;
  const stats = aggregate(sink.all());

  return {
    threshold: options.threshold ?? null,
    total,
    answerAgreement: total > 0 ? cases.filter((c) => c.answerAgree).length / total : 0,
    agreement: total > 0 ? cases.filter((c) => c.decisionMatch).length / total : 0,
    escalations,
    escalationRate: total > 0 ? escalations / total : 0,
    cases,
    stats,
    report: formatStatsReport(stats),
  };
}

/**
 * Run the eval over a grid of thresholds and return the calibration curve
 * (agreement + escalation at each cutoff). The shape is deliberately compact so
 * a caller can pick the operating threshold — or paste the curve into a report.
 */
export async function sweepGoldenEval(
  fixtures: readonly GoldenFixture[],
  thresholds: readonly number[],
  options: Omit<GoldenEvalOptions, "fixtures" | "threshold"> = {},
): Promise<GoldenSweepPoint[]> {
  const points: GoldenSweepPoint[] = [];
  for (const threshold of thresholds) {
    const result = await runGoldenEval({ ...options, fixtures, threshold });
    points.push({
      threshold,
      agreement: result.agreement,
      escalations: result.escalations,
      escalationRate: result.escalationRate,
    });
  }
  return points;
}
