// ─── MemoryProvider — pluggable memory for the context primer ────────────────
//
// The ContextPrimer talks ONLY to this interface, so the memory backend is an
// env switch (JEV_MEMORY=local|engram|cloud|neon|none, see ./registry.ts):
//
//   local  (alias engram) — local Engram HTTP/CLI (default in dev).
//            Search returns 300-char previews, so `get` is ALWAYS used for full
//            content.
//   cloud  — a remote Engram server (ENGRAM_CLOUD_URL + ENGRAM_CLOUD_TOKEN);
//            identical semantics, different endpoint.
//   neon   — a portable `jen_memory` table on the app's own Postgres, scoped by
//            tenant_id (or NULL = harness/global) + project (deployments with
//            no Engram).
//   none   — stateless; every method returns empty (fail-soft fallback).
//
// Memory is ADVISORY context: an unavailable backend must never block a
// decision. Implementations therefore fail soft (empty result), not closed.

export interface MemRef {
  id: string;
  title?: string;
  type?: string;
  topicKey?: string;
  project?: string;
  /** Short preview when the backend returns one (Engram previews are 300 chars). */
  preview?: string;
  score?: number;
}

export interface MemorySaveInput {
  title: string;
  topicKey: string;
  type: string;
  content: string;
}

export interface MemorySearchOptions {
  project?: string;
  limit?: number;
}

export interface MemoryContextOptions {
  project?: string;
}

export interface MemoryProvider {
  readonly name: string;
  /** Top-k references for a query (previews only — call `get` for content). */
  search(query: string, opts?: MemorySearchOptions): Promise<MemRef[]>;
  /** Full observation content by id — never the preview. */
  get(id: string): Promise<string>;
  /** Persist a new observation; returns its backend id. */
  save(input: MemorySaveInput): Promise<string>;
  /** Recent-session context blob (may be empty). */
  context(opts?: MemoryContextOptions): Promise<string>;
}
