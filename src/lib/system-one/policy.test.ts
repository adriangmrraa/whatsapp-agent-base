import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choiceMargin,
  noulThreshold,
  POLICY,
  PolicyError,
  policyLabels,
  postureOf,
  scoreThreshold,
} from "./policy";
import { LABEL_DEGRADATION } from "./types";
import { PACKS } from "./packs";

// ─── Policy registry — one source of truth, kind-separated, fail-closed ──────

test("policy: every registered pack has a matching posture entry", () => {
  for (const pack of PACKS) {
    assert.ok(POLICY[pack.id], `missing policy entry for pack "${pack.id}"`);
    assert.equal(
      postureOf(pack.id),
      pack.posture,
      `posture mismatch for pack "${pack.id}"`,
    );
  }
});

test("policy: extends LABEL_DEGRADATION (same posture per label)", () => {
  for (const [label, posture] of Object.entries(LABEL_DEGRADATION)) {
    assert.equal(postureOf(label), posture, `posture mismatch for "${label}"`);
  }
});

test("policy: an unregistered label fails closed", () => {
  assert.equal(postureOf("not-a-real-label"), "closed");
});

test("policy: protective labels are closed, advisory are open", () => {
  for (const label of ["guard", "scope-guard", "ambiguity", "risk", "role"]) {
    assert.equal(postureOf(label), "closed", `${label} must fail closed`);
  }
  for (const label of ["file-scope", "workload-forecast", "intent"]) {
    assert.equal(postureOf(label), "open", `${label} must fail open`);
  }
});

test("policy: packs read the policy values (no divergent literals)", () => {
  assert.equal(noulThreshold("guard", "irreversible"), 0.7);
  assert.equal(noulThreshold("guard", "injection"), 0.5);
  assert.equal(noulThreshold("file-scope", "file"), 0.4);
  assert.equal(noulThreshold("workload-forecast", "chained"), 0.5);
  assert.equal(scoreThreshold("workload-forecast", "sizeWarn"), 3);
  assert.equal(scoreThreshold("review", "weakScore"), 2);
});

test("policy: kinds are separate namespaces (a threshold is never reused)", () => {
  // "injection" is a noul key, not a score key.
  assert.throws(() => scoreThreshold("guard", "injection"), PolicyError);
  // "weakScore" is a score key, not a noul key.
  assert.throws(() => noulThreshold("review", "weakScore"), PolicyError);
  // "file" is a noul key; there is no matching score/choice entry.
  assert.throws(() => scoreThreshold("file-scope", "file"), PolicyError);
  assert.throws(() => choiceMargin("file-scope", "file"), PolicyError);
  // "folderMargin" is a choice key, not a noul key.
  assert.throws(() => noulThreshold("file-scope", "folderMargin"), PolicyError);
});

test("policy: unknown label throws for every kind", () => {
  assert.throws(() => noulThreshold("nope", "x"), PolicyError);
  assert.throws(() => choiceMargin("nope", "x"), PolicyError);
  assert.throws(() => scoreThreshold("nope", "x"), PolicyError);
});

test("policy: noul cutoffs are absolute probabilities in [0,1]", () => {
  for (const label of policyLabels()) {
    for (const [key, value] of Object.entries(POLICY[label].noul)) {
      assert.ok(
        value >= 0 && value <= 1,
        `noul ${label}.${key}=${value} outside [0,1]`,
      );
    }
  }
});

test("policy: choice margins are relative (non-negative)", () => {
  for (const label of policyLabels()) {
    for (const [key, value] of Object.entries(POLICY[label].choice)) {
      assert.ok(value >= 0, `choice ${label}.${key}=${value} must be >= 0`);
    }
  }
});

test("policy: folder choice margin is the registered relative threshold", () => {
  assert.equal(choiceMargin("file-scope", "folderMargin"), 0);
});

test("policy: PolicyError carries label, key and kind", () => {
  const error = new PolicyError("guard", "injection", "score");
  assert.equal(error.name, "PolicyError");
  assert.equal(error.label, "guard");
  assert.equal(error.key, "injection");
  assert.equal(error.kind, "score");
  assert.match(error.message, /guard/);
});
