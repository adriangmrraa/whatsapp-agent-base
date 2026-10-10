import { getAgentConfig } from "@/lib/tenants";
import { decryptIfEncrypted } from "@/lib/encryption";

// ─── Per-tenant embedding provider resolution ────────────────────────────────
//
// Same precedence as the chat model config (src/lib/ai/config.ts): the tenant's
// agent_config.embedding_* wins; env vars are the bootstrap fallback. Any
// OpenAI-compatible `/embeddings` endpoint works (OpenAI, Azure OpenAI,
// OpenRouter, Together, a local Ollama proxy...).

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}

const DEFAULT_DIMENSIONS = 1536;

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const ENV_CONFIG: EmbeddingConfig = {
  apiKey: process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  baseUrl: (
    process.env.EMBEDDING_BASE_URL ??
    process.env.AI_BASE_URL ??
    "https://api.openai.com/v1"
  ).replace(/\/+$/, ""),
  model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  dimensions: envNumber(process.env.EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS),
};

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; value: EmbeddingConfig }>();

export function invalidateEmbeddingConfigCache(tenantId: number): void {
  cache.delete(tenantId);
}

export async function getEmbeddingConfig(
  tenantId: number,
): Promise<EmbeddingConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const cfg = await getAgentConfig(tenantId);
    const value: EmbeddingConfig = {
      apiKey:
        decryptIfEncrypted(cfg?.embeddingApiKey?.trim() || "") ||
        ENV_CONFIG.apiKey,
      baseUrl: (
        cfg?.embeddingBaseUrl?.trim() ||
        ENV_CONFIG.baseUrl
      ).replace(/\/+$/, ""),
      model: cfg?.embeddingModel?.trim() || ENV_CONFIG.model,
      dimensions: cfg?.embeddingDimensions ?? ENV_CONFIG.dimensions,
    };
    cache.set(tenantId, { at: Date.now(), value });
    return value;
  } catch {
    return ENV_CONFIG;
  }
}

/** True when an embedding provider can actually be called. */
export async function isEmbeddingsConfigured(tenantId: number): Promise<boolean> {
  const cfg = await getEmbeddingConfig(tenantId);
  return cfg.apiKey.length > 0 && cfg.baseUrl.length > 0;
}
