import { createOpenAI, openai as defaultOpenai } from "@ai-sdk/openai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { getAgentConfig } from "@/lib/tenants";
import { decryptIfEncrypted } from "@/lib/encryption";
import { AI_BASE_URL, AI_MODEL, AI_MODEL_FAST, AI_MODEL_VISION } from "./models";

// ─── Per-tenant AI provider resolution ──────────────────────────────────────
//
// Each tenant can point the agent at ANY OpenAI-compatible provider
// (OpenAI, OpenRouter, DeepSeek, Groq, Together, Ollama...) from the admin
// panel. Env vars remain the bootstrap/default path.

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  modelFast: string;
  modelVision: string;
}

const ENV_CONFIG: AIConfig = {
  apiKey: process.env.OPENAI_API_KEY ?? "",
  baseUrl: AI_BASE_URL,
  model: AI_MODEL,
  modelFast: AI_MODEL_FAST,
  modelVision: AI_MODEL_VISION,
};

const TTL_MS = 30_000;
const cache = new Map<number, { at: number; value: AIConfig }>();

export function invalidateAIConfigCache(tenantId: number): void {
  cache.delete(tenantId);
}

export async function getAIConfig(tenantId: number): Promise<AIConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const cfg = await getAgentConfig(tenantId);
    const value: AIConfig = {
      apiKey:
        decryptIfEncrypted(cfg?.aiApiKey?.trim() || "") || ENV_CONFIG.apiKey,
      baseUrl: (cfg?.aiBaseUrl?.trim() || ENV_CONFIG.baseUrl).replace(
        /\/+$/,
        "",
      ),
      model: cfg?.aiModel?.trim() || ENV_CONFIG.model,
      modelFast: cfg?.aiModelFast?.trim() || ENV_CONFIG.modelFast,
      modelVision: cfg?.aiModelVision?.trim() || ENV_CONFIG.modelVision,
    };
    cache.set(tenantId, { at: Date.now(), value });
    return value;
  } catch {
    return ENV_CONFIG;
  }
}

/**
 * DeepSeek defaults to "thinking" mode, which rejects tool_choice:"required"
 * with HTTP 400. Disable thinking at the transport layer.
 */
const deepseekNonThinkingFetch: typeof fetch = (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      const url = String(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input
            : input.url,
      );
      if (url.includes("/responses")) {
        body.reasoning = { effort: "none" };
      } else {
        body.thinking = { type: "disabled" };
      }
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // non-JSON body — pass through untouched
    }
  }
  return fetch(input, init);
};

export function isDeepSeekBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("deepseek.com");
}

export function isOpenAIBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("api.openai.com");
}

export async function getAIProvider(
  tenantId: number,
): Promise<OpenAIProvider> {
  const cfg = await getAIConfig(tenantId);
  if (!cfg.apiKey) return defaultOpenai;
  return createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: isDeepSeekBaseUrl(cfg.baseUrl) ? deepseekNonThinkingFetch : undefined,
  });
}

export async function getMainChatModel(tenantId: number) {
  const [provider, cfg] = await Promise.all([
    getAIProvider(tenantId),
    getAIConfig(tenantId),
  ]);
  return provider.chat(cfg.model);
}

export async function getVisionModel(tenantId: number) {
  const [provider, cfg] = await Promise.all([
    getAIProvider(tenantId),
    getAIConfig(tenantId),
  ]);
  return provider.chat(cfg.modelVision);
}
