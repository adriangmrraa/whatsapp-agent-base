import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOnboardArgs, DEFAULT_ONBOARD_OPTIONS, onboardUsage } from "./args";

test("args: no flags yields safe defaults", () => {
  assert.deepEqual(parseOnboardArgs([]), DEFAULT_ONBOARD_OPTIONS);
});

test("args: boolean flags", () => {
  const opts = parseOnboardArgs([
    "--yes",
    "--dry-run",
    "--jev",
    "--meta",
    "--ycloud",
    "--no-db",
  ]);
  assert.equal(opts.yes, true);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.jev, true);
  assert.equal(opts.meta, true);
  assert.equal(opts.ycloud, true);
  assert.equal(opts.noDb, true);
});

test("args: --decisions=openai", () => {
  assert.equal(parseOnboardArgs(["--decisions=openai"]).decisions, "openai");
  // Invalid engine values are ignored.
  assert.equal(parseOnboardArgs(["--decisions=laya"]).decisions, null);
});

test("args: value flags accept = and space forms", () => {
  assert.equal(parseOnboardArgs(["--catalog=data/p.csv"]).catalog, "data/p.csv");
  assert.equal(parseOnboardArgs(["--catalog", "data/p.csv"]).catalog, "data/p.csv");
  assert.equal(parseOnboardArgs(["--agent=opencode"]).agent, "opencode");
});

test("args: unknown flags are ignored (fail-soft)", () => {
  const opts = parseOnboardArgs(["--nope", "--yes", "-x", "positional"]);
  assert.equal(opts.yes, true);
  assert.equal(opts.catalog, null);
});

test("args: --help", () => {
  assert.equal(parseOnboardArgs(["--help"]).help, true);
  assert.equal(parseOnboardArgs(["-h"]).help, true);
});

test("args: usage mentions the documented flags", () => {
  const usage = onboardUsage();
  for (const flag of [
    "--yes",
    "--dry-run",
    "--jev",
    "--decisions=openai",
    "--meta",
    "--ycloud",
    "--catalog",
    "--no-db",
  ]) {
    assert.ok(usage.includes(flag), `usage should mention ${flag}`);
  }
});
