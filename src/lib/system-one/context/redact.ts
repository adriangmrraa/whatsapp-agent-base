// ─── State redaction ─────────────────────────────────────────────────────────
//
// The ContextPrimer builds `state` from memories, skill rules, and candidate
// snippets. That state may leave the process to a hosted decision API
// (Jev/OpenAI), so it must carry NO secrets and NO PII — see
// docs/security.md ("PII egress to hosted decision API").
//
// Two layers, both applied:
//   1. Key-name deny list — any object key matching a sensitive pattern is
//      replaced wholesale, regardless of its value.
//   2. Value patterns — obvious secret shapes (API keys, bearer tokens, JWTs,
//      private-key blocks, emails) are scrubbed from every string.
//
// Pure and non-mutating: returns a redacted copy. Depth-bounded and
// cycle-safe so it can never hang on adversarial input.

export const REDACTED = "[REDACTED]";
export const REDACTED_EMAIL = "[REDACTED_EMAIL]";
const MAX_DEPTH = 12;

const DENY_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|wd|phrase)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /apikey/i,
  /access[-_]?key/i,
  /private[-_]?key/i,
  /authorization|^auth$|\bauth[-_]?(header|token)\b/i,
  /cookie/i,
  /session[-_]?id/i,
  /credential/i,
  /\b(cvv|cvc|ssn|iban)\b/i,
  /card[-_]?number/i,
  /\b(phone|telefono|tel[ée]fono|whatsapp|msisdn)\b/i,
  /\b(e-?mail|correo)\b/i,
  /\b(dni|documento|document[-_]?number|national[-_]?id)\b/i,
];

const VALUE_PATTERNS: readonly [RegExp, string][] = [
  [/sk-[A-Za-z0-9_-]{12,}/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED_EMAIL],
];

/** True when an object key names a sensitive field we never emit. */
export function isSensitiveKey(key: string): boolean {
  return DENY_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/** Scrub obvious secret/PII shapes out of a single string. */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (seen.has(value)) return REDACTED;

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => walk(item, depth + 1, seen));
  }

  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : walk(child, depth + 1, seen);
  }
  return out;
}

/**
 * Return a redacted deep copy of `state`. Keys matching the deny list are
 * replaced by `[REDACTED]`; every string is value-scrubbed for secrets/PII.
 * Never mutates the input.
 */
export function redactState<T>(state: T): T {
  return walk(state, 0, new WeakSet<object>()) as T;
}
