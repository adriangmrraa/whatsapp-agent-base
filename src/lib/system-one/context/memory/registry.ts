import { createEngramMemoryProvider, type EngramMemoryOptions } from "./engram";
import { createNeonMemoryProvider, type NeonMemoryClient } from "./neon";
import { createNoneMemoryProvider } from "./none";
import type { MemoryProvider } from "./types";

// ─── Memory-provider resolution ──────────────────────────────────────────────
//
// Backend is an env switch: explicit option → JEV_MEMORY → default `engram`
// (local Engram in dev). `neon` requires a tenantId (tenant-scoped table); with
// no tenant it degrades to `none` rather than leaking an unscoped query.
//
// Pure and synchronous (env injectable), so the primer can resolve per call.

export type MemoryBackend = "engram" | "neon" | "none";

export interface ResolveMemoryOptions {
  backend?: string | null;
  env?: Record<string, string | undefined>;
  /** Required for the neon backend (isolation boundary). */
  tenantId?: number;
  project?: string;
  fetchFn?: typeof fetch;
  engram?: EngramMemoryOptions;
  neon?: { client?: NeonMemoryClient };
}

function coerceBackend(raw: string | null | undefined): MemoryBackend | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "engram" || value === "neon" || value === "none") return value;
  return null;
}

export function resolveMemoryProvider(
  options: ResolveMemoryOptions = {},
): MemoryProvider {
  const env = options.env ?? process.env;
  const backend =
    coerceBackend(options.backend) ??
    coerceBackend(env.JEV_MEMORY) ??
    "engram";

  if (backend === "none") return createNoneMemoryProvider();

  if (backend === "neon") {
    if (options.tenantId === undefined) return createNoneMemoryProvider();
    return createNeonMemoryProvider({
      tenantId: options.tenantId,
      project: options.project,
      client: options.neon?.client,
    });
  }

  const engram = options.engram ?? {};
  return createEngramMemoryProvider({
    ...engram,
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
