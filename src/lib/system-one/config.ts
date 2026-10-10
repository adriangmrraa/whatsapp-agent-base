import { getAgentConfig } from "@/lib/tenants";
import { decryptIfEncrypted } from "@/lib/encryption";

// ─── Per-tenant hosted decision-layer resolution ─────────────────────────────
//
// Same precedence as the embedding config (src/lib/embeddings/config.ts): the
// tenant's agent_config.decision_* wins; env vars are the bootstrap fallback.
// The hosted System One API is OPTIONAL — with no apiKey + baseUrl the local
// rules layer answers and nothing leaves the process.

export type DecisionEngine = "jev" | "laya";

export interface DecisionConfig {
  apiKey: string;
  baseUrl: string;
  engine: DecisionEngine;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 800;
const DEFAULT_ENGINE: DecisionEngine = "jev";

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Engine allowlist — anything unknown degrades to the Jev default. */
function engineOrDefault(value: string | null | undefined): DecisionEngine {
  return value === "jev" || value === "laya" ? value : DEFAULT_ENGINE;
}

const ENV_CONFIG: DecisionConfig = {
  apiKey: process.env.DECISION_API_KEY ?? "",
  baseUrl: (process.env.DECISION_BASE_URL ?? "").replace(/\/+$/, ""),
  engine: engineOrDefault(process.env.DECISION_ENGINE),
  timeoutMs: envNumber(process.env.DECISION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
};

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; value: DecisionConfig }>();

export function invalidateDecisionConfigCache(tenantId: number): void {
  cache.delete(tenantId);
}

export async function getDecisionConfig(
  tenantId: number,
): Promise<DecisionConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const cfg = await getAgentConfig(tenantId);
    const value: DecisionConfig = {
      apiKey:
        decryptIfEncrypted(cfg?.decisionApiKey?.trim() || "") ||
        ENV_CONFIG.apiKey,
      baseUrl: (
        cfg?.decisionBaseUrl?.trim() ||
        ENV_CONFIG.baseUrl
      ).replace(/\/+$/, ""),
      engine: engineOrDefault(cfg?.decisionEngine?.trim() || ENV_CONFIG.engine),
      timeoutMs: ENV_CONFIG.timeoutMs,
    };
    cache.set(tenantId, { at: Date.now(), value });
    return value;
  } catch {
    return ENV_CONFIG;
  }
}

/** True when a hosted decision API can actually be called. */
export async function isDecisionConfigured(tenantId: number): Promise<boolean> {
  const cfg = await getDecisionConfig(tenantId);
  return cfg.apiKey.length > 0 && cfg.baseUrl.length > 0;
}
