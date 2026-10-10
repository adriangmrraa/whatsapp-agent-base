// ─── JEV golden eval (Phase 3.2) ─────────────────────────────────────────────
//
// Labelled fixtures + a runner for the three highest-leverage packs, measured
// through the Phase-4 ledger. Pure and network-free; ships with a fixture test.

export { GOLDEN_FIXTURES, goldenFixturesFor } from "./fixtures";
export { runGoldenEval, sweepGoldenEval } from "./runner";
export type {
  GoldenCase,
  GoldenDecision,
  GoldenEvalOptions,
  GoldenEvalResult,
  GoldenFixture,
  GoldenPackId,
  GoldenSweepPoint,
} from "./types";
