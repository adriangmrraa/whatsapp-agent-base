import { getEmbeddingConfig } from "./config";
import { createOpenAIEmbeddingProvider } from "./openai";
import type { EmbeddingProvider } from "./types";

// ─── Embedding provider registry ─────────────────────────────────────────────
//
// The only place that knows which concrete adapter serves a tenant. Today it is
// always the OpenAI-compatible adapter (the tenant's base_url picks the host);
// more adapters can be registered here without touching the engine.

export async function getEmbeddingProvider(
  tenantId: number,
): Promise<EmbeddingProvider> {
  const cfg = await getEmbeddingConfig(tenantId);
  return createOpenAIEmbeddingProvider({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    dimensions: cfg.dimensions,
  });
}
