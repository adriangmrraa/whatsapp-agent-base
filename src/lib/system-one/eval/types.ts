import type { Answer } from "../provider/types";
import type { PackCandidate } from "../packs/types";
import type { AggregateStats, DecisionSample } from "../ledger";

// ─── Golden-fixture evaluation contract (Phase 3.2) ──────────────────────────
//
// The harness owns its own labelled data (plan §7 step 5: "tune thresholds on
// your own labeled data"). A golden fixture is code — no network, no provider
// key — so the eval is reproducible and safe to run in CI alongside the gate.
//
// Three packs are covered: file-scope (per-candidate noul + folder choice),
// workload-forecast (score + two noul) and guard (four noul, protective).

export type GoldenPackId = "file-scope" | "workload-forecast" | "guard";

/** The golden pack decision — the shape is per-pack, discriminated by packId. */
export type GoldenDecision =
  | { packId: "guard"; flags: string[] }
  | {
      packId: "file-scope";
      files: string[];
      folder: string;
      incomplete: boolean;
    }
  | {
      packId: "workload-forecast";
      guardLines: string[];
      chained: boolean;
      decisionNeeded: boolean;
    };

export interface GoldenFixture {
  id: string;
  packId: GoldenPackId;
  task: string;
  candidates?: PackCandidate[];
  /** Scripted provider answers (what the model returns for this fixture). */
  answers: Record<string, Answer>;
  /**
   * Golden answers the provider ought to return; the ledger's
   * `answerMapMatches` scores the scripted answers against this. Defaults to
   * `answers` (the model got every fixture right) when omitted.
   */
  expected?: Record<string, Answer>;
  /** Golden pack decision the runner must reproduce. */
  decision: GoldenDecision;
  /** Golden escalation: the pack blocked / flagged / needed a decision. */
  escalate: boolean;
}

export interface GoldenCase {
  id: string;
  packId: GoldenPackId;
  /** Ledger answer-level agreement (`answerMapMatches`). */
  answerAgree: boolean;
  /** The pack's derived decision equals the golden decision. */
  decisionMatch: boolean;
  escalate: boolean;
  expectedEscalate: boolean;
  /** The ledger sample recorded for this decision. */
  sample: DecisionSample;
}

export interface GoldenEvalResult {
  /** The noul threshold override applied, or null for policy defaults. */
  threshold: number | null;
  total: number;
  /** Fraction of fixtures whose answers match the golden answers (ledger). */
  answerAgreement: number;
  /** Fraction of fixtures whose pack decision matches the golden decision. */
  agreement: number;
  escalations: number;
  escalationRate: number;
  cases: GoldenCase[];
  stats: AggregateStats;
  /** Plain-text ledger report (`formatStatsReport`). */
  report: string;
}

export interface GoldenEvalOptions {
  fixtures: readonly GoldenFixture[];
  /** Absolute noul cutoff override applied to every noul threshold of the pack. */
  threshold?: number;
  /** Ordered-rubric index override for the workload size score. */
  scoreThreshold?: number;
  /** Tolerance for the ledger's `answerMapMatches` (default 0.1). */
  tolerance?: number;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number;
}

/** One point of the threshold sweep (`sweepGoldenEval`). */
export interface GoldenSweepPoint {
  threshold: number;
  agreement: number;
  escalations: number;
  escalationRate: number;
}
