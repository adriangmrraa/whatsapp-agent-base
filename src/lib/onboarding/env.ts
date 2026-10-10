import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── .env.local bootstrap helpers ────────────────────────────────────────────
//
// Idempotent, secret-safe env-file utilities for the onboarding command.
// `setEnvVars` is pure (string in → string out) and returns ONLY the key names
// that changed — never the values. Nothing here logs.

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

const PLACEHOLDER_HINTS = [
  "your-",
  "generate-with",
  "change-me",
  "replace-me",
  "<",
  "sk-...",
  "example",
];

/** A value counts as unset when empty or obviously a template placeholder. */
export function looksLikePlaceholder(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Merges `updates` into an env-file body: existing `KEY=...` lines are
 * replaced in place; new keys are appended. Preserves comments and ordering.
 * Returns the new body plus the key names whose value actually changed.
 */
export function setEnvVars(
  content: string,
  updates: Record<string, string>,
): { content: string; changedKeys: string[] } {
  const body = content.length > 0 ? content.replace(/\n+$/, "") : "";
  const lines = body.length > 0 ? body.split("\n") : [];
  const indexByKey = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i]);
    if (match && !indexByKey.has(match[1])) indexByKey.set(match[1], i);
  }

  const changedKeys: string[] = [];

  for (const [key, rawValue] of Object.entries(updates)) {
    // Env values are single-line by definition; skip anything that would
    // corrupt the file.
    if (rawValue.includes("\n") || rawValue.includes("\r")) continue;

    const line = `${key}=${rawValue}`;
    const at = indexByKey.get(key);
    if (at === undefined) {
      lines.push(line);
      indexByKey.set(key, lines.length - 1);
      changedKeys.push(key);
      continue;
    }
    const match = KEY_LINE.exec(lines[at]);
    if (match && match[2] === rawValue) continue; // already current
    lines[at] = line;
    changedKeys.push(key);
  }

  const joined = lines.join("\n");
  // Env files end with a newline; keep that invariant.
  return { content: joined.length > 0 ? `${joined}\n` : "", changedKeys };
}

export function readEnvFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export interface EnvLocalResult {
  path: string;
  /** True when a new file was (or, in dry-run, would be) created. */
  created: boolean;
}

/**
 * Creates `.env.local` from `.env.example` only when it does not exist.
 * Existing files are never overwritten (idempotent).
 */
export function ensureEnvLocal(options: {
  dir: string;
  dryRun?: boolean;
}): EnvLocalResult {
  const target = join(options.dir, ".env.local");
  const example = join(options.dir, ".env.example");

  if (existsSync(target)) return { path: target, created: false };
  if (!existsSync(example)) {
    throw new Error(".env.example not found; run from the repository root");
  }
  if (!options.dryRun) copyFileSync(example, target);
  return { path: target, created: true };
}

/** Applies `updates` to an env file. Returns changed key NAMES only. */
export function writeEnvVars(options: {
  path: string;
  updates: Record<string, string>;
  dryRun?: boolean;
}): { changedKeys: string[] } {
  const existing = readEnvFile(options.path);
  const { content, changedKeys } = setEnvVars(existing, options.updates);
  if (!options.dryRun && changedKeys.length > 0) {
    writeFileSync(options.path, content, "utf8");
  }
  return { changedKeys };
}
