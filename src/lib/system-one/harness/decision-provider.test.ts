import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDecisionProviderBlock,
  isEnabled,
  renderDecisionProviderBlock,
  resolveDecisionProviderInfo,
  SDD_PACK_IDS,
  SDD_HARNESS_FLAG,
} from "./decision-provider";

const SECRET = "sk-super-secret-value-do-not-leak";

test("disabled by default: no block is emitted", () => {
  assert.equal(renderDecisionProviderBlock({}), "");
  assert.equal(resolveDecisionProviderInfo({}).enabled, false);
});

test("opt-in flag accepts the documented truthy variants", () => {
  for (const value of ["1", "true", "YES", "on", "On"]) {
    assert.equal(isEnabled({ [SDD_HARNESS_FLAG]: value }), true);
  }
  for (const value of ["", "0", "no", "off", "maybe"]) {
    assert.equal(isEnabled({ [SDD_HARNESS_FLAG]: value }), false);
  }
});

test("enabled jev block mentions the layer, base url, and key PRESENCE only", () => {
  const env = {
    [SDD_HARNESS_FLAG]: "1",
    DECISION_ENGINE: "jev",
    JEV_API_KEY: SECRET,
  };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.enabled, true);
  assert.equal(info.engine, "jev");
  assert.equal(info.baseUrl, "https://api.typesafe.ai");
  assert.equal(info.keyVar, "JEV_API_KEY");
  assert.equal(info.keyPresent, true);

  const block = renderDecisionProviderBlock(env);
  assert.match(block, /^## Decision Provider \(auto-resolved\)/);
  assert.match(block, /engine: `jev`/);
  assert.match(block, /base_url: `https:\/\/api\.typesafe\.ai`/);
  assert.match(block, /api_key: present \(JEV_API_KEY/);
  for (const packId of SDD_PACK_IDS) {
    assert.ok(block.includes(`\`${packId}\``), `missing pack ${packId}`);
  }
  assert.ok(block.includes("sdd/<change>/decisions/<phase>"));

  // The secret value must NEVER appear anywhere in the block.
  assert.equal(block.includes(SECRET), false);
});

test("absent key is reported as absent, never fabricated", () => {
  const env = { [SDD_HARNESS_FLAG]: "1", DECISION_ENGINE: "jev" };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.keyPresent, false);
  const block = buildDecisionProviderBlock(info);
  assert.match(block, /api_key: absent \(TYPESAFE_API_KEY not set\)/);
});

test("TYPESAFE_API_KEY satisfies the jev engine and is named", () => {
  const env = {
    [SDD_HARNESS_FLAG]: "true",
    TYPESAFE_API_KEY: SECRET,
  };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.engine, "jev");
  assert.equal(info.keyVar, "TYPESAFE_API_KEY");
  assert.equal(info.keyPresent, true);
  assert.equal(renderDecisionProviderBlock(env).includes(SECRET), false);
});

test("openai-decisions engine maps base url, model and key var", () => {
  const env = {
    [SDD_HARNESS_FLAG]: "1",
    DECISION_ENGINE: "openai-decisions",
    OPENAI_API_KEY: SECRET,
  };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.engine, "openai-decisions");
  assert.equal(info.baseUrl, "https://api.openai.com");
  assert.equal(info.model, "gpt-6-luna");
  assert.equal(info.keyVar, "OPENAI_API_KEY");
  assert.equal(renderDecisionProviderBlock(env).includes(SECRET), false);
});

test("rules engine emits an offline block with no key", () => {
  const env = { [SDD_HARNESS_FLAG]: "1", DECISION_ENGINE: "rules" };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.engine, "rules");
  assert.equal(info.baseUrl, "");
  assert.equal(info.keyPresent, false);
  const block = buildDecisionProviderBlock(info);
  assert.match(block, /engine: `rules`/);
  assert.match(block, /api_key: n\/a/);
});

test("DECISION_PROVIDER wins over DECISION_ENGINE; DECISION_BASE_URL overrides", () => {
  const env = {
    [SDD_HARNESS_FLAG]: "1",
    DECISION_PROVIDER: "openai",
    DECISION_ENGINE: "jev",
    DECISION_BASE_URL: "https://gateway.test/",
  };
  const info = resolveDecisionProviderInfo(env);
  assert.equal(info.engine, "openai-decisions");
  assert.equal(info.baseUrl, "https://gateway.test");
});
