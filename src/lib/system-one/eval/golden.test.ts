import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_FIXTURES, goldenFixturesFor } from "./fixtures";
import { runGoldenEval, sweepGoldenEval } from "./runner";

// Deterministic clock: every sample gets latency 0 so the report is stable.
const now = (): number => 0;

test("golden: every fixture agrees with its pack at the policy defaults", async () => {
  const result = await runGoldenEval({ fixtures: GOLDEN_FIXTURES, now });

  assert.equal(result.total, GOLDEN_FIXTURES.length);
  assert.equal(result.agreement, 1, "decision agreement must be 1.0");
  assert.equal(result.answerAgreement, 1, "answer agreement must be 1.0");

  for (const item of result.cases) {
    assert.equal(item.decisionMatch, true, `${item.id}: decision mismatch`);
    assert.equal(item.escalate, item.expectedEscalate, `${item.id}: escalation mismatch`);
  }
});

test("golden: the ledger records exactly one sample per fixture", async () => {
  const result = await runGoldenEval({ fixtures: GOLDEN_FIXTURES, now });

  assert.equal(result.stats.samples, GOLDEN_FIXTURES.length);
  assert.equal(result.stats.errors, 0);
  assert.match(result.report, /JEV ledger — aggregate stats/);
  assert.match(result.report, /by pack:/);
});

test("golden: guard escalates less as the threshold rises", async () => {
  const fixtures = goldenFixturesFor("guard");
  const low = await runGoldenEval({ fixtures, threshold: 0.5, now });
  const high = await runGoldenEval({ fixtures, threshold: 0.6, now });

  assert.ok(
    high.escalations < low.escalations,
    `guard escalations must fall: ${low.escalations} -> ${high.escalations}`,
  );
});

test("golden: file-scope flags more incomplete sets as the threshold rises", async () => {
  const fixtures = goldenFixturesFor("file-scope");
  const low = await runGoldenEval({ fixtures, threshold: 0.5, now });
  const high = await runGoldenEval({ fixtures, threshold: 0.6, now });

  assert.ok(
    high.escalations > low.escalations,
    `file-scope escalations must rise: ${low.escalations} -> ${high.escalations}`,
  );
});

test("golden: workload escalates less as the threshold rises", async () => {
  const fixtures = goldenFixturesFor("workload-forecast");
  const low = await runGoldenEval({ fixtures, threshold: 0.5, now });
  const high = await runGoldenEval({ fixtures, threshold: 0.6, now });

  assert.ok(
    high.escalations < low.escalations,
    `workload escalations must fall: ${low.escalations} -> ${high.escalations}`,
  );
});

test("golden: the sweep returns one calibration point per threshold", async () => {
  const points = await sweepGoldenEval(GOLDEN_FIXTURES, [0.4, 0.5, 0.6], { now });

  assert.equal(points.length, 3);
  assert.deepEqual(
    points.map((point) => point.threshold),
    [0.4, 0.5, 0.6],
  );
  for (const point of points) {
    assert.ok(point.agreement >= 0 && point.agreement <= 1);
    assert.ok(point.escalationRate >= 0 && point.escalationRate <= 1);
  }
});
