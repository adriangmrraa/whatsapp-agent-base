import { createEngramMemoryProvider, type EngramMemoryOptions } from "./engram";
import { createNeonMemoryProvider, type NeonMemoryClient } from "./neon";
import { createNoneMemoryProvider } from "./none";
import type { MemoryProvider } from "./types";

// ─── Memory-provider resolution ──────────────────────────────────────────────
//
// The memory layer IS Engram; the only choice is WHERE the memories live. The
// backend is an env switch (explicit option → JEV_MEMORY → default `local`) —
// switching never requires a code change:
//
//   local  (alias: engram) — the local Engram server (ENGRAM_HTTP_URL,
//                            default http://127.0.0.1:7437).
//   cloud                  — a remote Engram server (ENGRAM_CLOUD_URL +
//                            ENGRAM_CLOUD_TOKEN).
//   neon                   — Engram semantics on the app's own Postgres
//                            (`jen_memory` via DATABASE_URL). Scope is the
//                            tenant when provided, else the harness/global
//                            (null) scope — it never runs an unscoped query.
//   none                   — fail-soft degraded fallback (stateless); used only
//                            when a backend is explicitly `none` or a cloud URL
//                            is not configured. Memory is advisory and must
//                            never block a decision.
//
// Pure and synchronous (env injectable), so the primer can resolve per call.

export type MemoryBackend = "local" | "cloud" | "neon" | "none";

export interface ResolveMemoryOptions {
  backend?: string | null;
  env?: Record<string, string | undefined>;
  /**
   * Tenant scope for the neon backend. A number scopes to that tenant (the
   * product always sets it); `null`/omitted means the harness/global scope.
   */
  tenantId?: number | null;
  project?: string;
  fetchFn?: typeof fetch;
  /** Overrides for the local Engram backend. */
  engram?: EngramMemoryOptions;
  /** Overrides for the remote cloud Engram backend. */
  cloud?: EngramMemoryOptions;
  neon?: { client?: NeonMemoryClient; databaseUrl?: string };
}

function coerceBackend(raw: string | null | undefined): MemoryBackend | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "engram" || value === "local") return "local";
  if (value === "cloud" || value === "neon" || value === "none") return value;
  return null;
}

export function resolveMemoryProvider(
  options: ResolveMemoryOptions = {},
): MemoryProvider {
  const env = options.env ?? process.env;
  const backend =
    coerceBackend(options.backend) ??
    coerceBackend(env.JEV_MEMORY) ??
    "local";

  if (backend === "none") return createNoneMemoryProvider();

  if (backend === "neon") {
    return createNeonMemoryProvider({
      tenantId: options.tenantId ?? null,
      project: options.project,
      client: options.neon?.client,
      databaseUrl: options.neon?.databaseUrl,
    });
  }

  if (backend === "cloud") {
    const cloud = options.cloud ?? {};
    const baseUrl = cloud.baseUrl ?? env.ENGRAM_CLOUD_URL;
    if (!baseUrl) return createNoneMemoryProvider();
    return createEngramMemoryProvider({
      ...cloud,
      name: cloud.name ?? "cloud",
      baseUrl,
      token: cloud.token ?? env.ENGRAM_CLOUD_TOKEN,
      project: cloud.project ?? options.project ?? env.JEV_MEMORY_PROJECT,
      fetchFn: cloud.fetchFn ?? options.fetchFn,
    });
  }

  const engram = options.engram ?? {};
  return createEngramMemoryProvider({
    ...engram,
    name: engram.name ?? "engram",
    baseUrl: engram.baseUrl ?? env.ENGRAM_HTTP_URL,
    token: engram.token ?? env.ENGRAM_HTTP_TOKEN,
    project: engram.project ?? options.project ?? env.JEV_MEMORY_PROJECT,
    fetchFn: engram.fetchFn ?? options.fetchFn,
  });
}

/** Convenience wrapper around the process env for the dev harness. */
export function getMemoryProvider(
  options: Omit<ResolveMemoryOptions, "env"> = {},
): MemoryProvider {
  return resolveMemoryProvider({ ...options, env: process.env });
}
