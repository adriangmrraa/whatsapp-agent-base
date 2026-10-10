import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSensitiveKey,
  redactState,
  redactText,
  REDACTED,
  REDACTED_EMAIL,
} from "./redact";

test("redact: deny-listed keys are replaced wholesale", () => {
  const input = {
    task: "do it",
    apiKey: "sk-live-1234567890abcdef",
    authorization: "Bearer abc.def.ghi",
    contact: { phone: "5491112345678", email: "a@b.com" },
  };
  const out = redactState(input);
  assert.equal(out.task, "do it");
  assert.equal(out.apiKey, REDACTED);
  assert.equal(out.authorization, REDACTED);
  assert.equal(out.contact.phone, REDACTED);
  assert.equal(out.contact.email, REDACTED);
});

test("redact: value patterns scrub secrets and emails inside strings", () => {
  const text = "key sk-abcdefghijklmnop and Bearer xyztoken and a@b.com";
  const out = redactText(text);
  assert.ok(out.includes(REDACTED));
  assert.ok(out.includes(REDACTED_EMAIL));
  assert.ok(!out.includes("sk-abcdefghijklmnop"));
  assert.ok(!out.includes("a@b.com"));
});

test("redact: JWTs and private keys are scrubbed", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def456";
  assert.ok(redactText(jwt).includes(REDACTED));
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----";
  assert.equal(redactText(pem), REDACTED);
});

test("redact: does not mutate the input and handles arrays/cycles", () => {
  const input: Record<string, unknown> = {
    facts: [{ token: "secret" }, { role: "admin" }],
  };
  const before = JSON.stringify(input);
  const out = redactState(input) as typeof input;
  assert.equal(JSON.stringify(input), before);
  const facts = out.facts as Array<Record<string, unknown>>;
  assert.equal(facts[0].token, REDACTED);
  assert.equal(facts[1].role, "admin");

  const cyclic: Record<string, unknown> = { name: "x" };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => redactState(cyclic));
});

test("redact: isSensitiveKey recognizes common secret names", () => {
  for (const key of ["apiKey", "API_KEY", "password", "accessToken", "privateKey", "ssn"]) {
    assert.ok(isSensitiveKey(key), key);
  }
  for (const key of ["task", "packId", "role", "path", "snippet"]) {
    assert.ok(!isSensitiveKey(key), key);
  }
});
