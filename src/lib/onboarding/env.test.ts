import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureEnvLocal,
  looksLikePlaceholder,
  setEnvVars,
  writeEnvVars,
} from "./env";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "onboard-env-"));
}

test("env: setEnvVars replaces in place and preserves comments/order", () => {
  const input = "# header\nDATABASE_URL=old\nAUTH_SECRET=x\n";
  const { content, changedKeys } = setEnvVars(input, { DATABASE_URL: "new" });
  assert.deepEqual(changedKeys, ["DATABASE_URL"]);
  assert.equal(content, "# header\nDATABASE_URL=new\nAUTH_SECRET=x\n");
});

test("env: setEnvVars appends new keys and is idempotent", () => {
  const first = setEnvVars("A=1\n", { B: "2" });
  assert.deepEqual(first.changedKeys, ["B"]);
  assert.equal(first.content, "A=1\nB=2\n");

  const second = setEnvVars(first.content, { B: "2" });
  assert.deepEqual(second.changedKeys, []);
  assert.equal(second.content, first.content);
});

test("env: setEnvVars returns only key names, never values", () => {
  const secret = "sk-live-super-secret-value";
  const { changedKeys } = setEnvVars("", { JEV_API_KEY: secret });
  assert.deepEqual(changedKeys, ["JEV_API_KEY"]);
  assert.ok(!JSON.stringify(changedKeys).includes(secret));
});

test("env: setEnvVars skips multiline values", () => {
  const { content, changedKeys } = setEnvVars("A=1\n", { B: "x\ny" });
  assert.deepEqual(changedKeys, []);
  assert.equal(content, "A=1\n");
});

test("env: ensureEnvLocal creates once then is a no-op", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, ".env.example"), "A=1\n");
    const first = ensureEnvLocal({ dir });
    assert.equal(first.created, true);
    assert.equal(readFileSync(first.path, "utf8"), "A=1\n");

    writeFileSync(first.path, "A=changed\n");
    const second = ensureEnvLocal({ dir });
    assert.equal(second.created, false);
    assert.equal(readFileSync(first.path, "utf8"), "A=changed\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env: ensureEnvLocal dry-run creates nothing", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, ".env.example"), "A=1\n");
    const res = ensureEnvLocal({ dir, dryRun: true });
    assert.equal(res.created, true);
    assert.throws(() => readFileSync(res.path, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env: writeEnvVars dry-run does not write", () => {
  const dir = tempDir();
  try {
    const path = join(dir, ".env.local");
    writeFileSync(path, "A=1\n");
    const res = writeEnvVars({ path, updates: { A: "2" }, dryRun: true });
    assert.deepEqual(res.changedKeys, ["A"]);
    assert.equal(readFileSync(path, "utf8"), "A=1\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env: looksLikePlaceholder flags template values", () => {
  assert.equal(looksLikePlaceholder(undefined), true);
  assert.equal(looksLikePlaceholder(""), true);
  assert.equal(looksLikePlaceholder("your-32-char-min-encryption-key-string"), true);
  assert.equal(looksLikePlaceholder("generate-with-openssl-rand-base64-32"), true);
  assert.equal(looksLikePlaceholder("sk-..."), true);
  assert.equal(looksLikePlaceholder("real-secret-123"), false);
});
