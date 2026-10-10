import { getAIConfig, isOpenAIBaseUrl } from "@/lib/ai/config";
import logger from "@/lib/logger";
import type { VoiceAgentConfig } from "./types";

// ─── OpenAI Realtime session bootstrap (server-side) ─────────────────────────
//
// The Realtime API speaks WebRTC/WebSocket directly from the client, but the
// long-lived API key must never reach the browser. The server mints a SHORT-
// LIVED ephemeral client secret (`POST /v1/realtime/sessions`) carrying the
// session config (model, voice, instructions, tools); the browser connects with
// that token and the key stays on the server.
//
// Only OpenAI serves Realtime today, so the tenant's generic AI config is used
// only when it points at OpenAI; otherwise the OPENAI_API_KEY env fallback is
// the source. This module is the provider boundary for Realtime — nothing else
// in the voice runtime talks HTTP to the model vendor.

const REALTIME_SESSIONS_PATH = "/realtime/sessions";
const REQUEST_TIMEOUT_MS = 20_000;

export interface RealtimeSessionSecret {
  /** Single-use client secret value the browser passes as a bearer token. */
  clientSecret: string;
  /** Epoch seconds at which the secret (and session) expire. */
  expiresAt: number;
  /** OpenAI-side session id (for logging/diagnostics only). */
  sessionId: string | null;
}

interface ResolvedRealtimeAuth {
  apiKey: string;
  baseUrl: string;
}

/**
 * Resolves the key + base URL for Realtime. Prefers an OpenAI-pointed tenant AI
 * config; falls back to the platform env key. Never logs the key.
 */
async function resolveRealtimeAuth(tenantId: number): Promise<ResolvedRealtimeAuth> {
  let tenantBase = "";
  let tenantKey = "";
  try {
    const cfg = await getAIConfig(tenantId);
    tenantBase = cfg.baseUrl;
    tenantKey = cfg.apiKey;
  } catch {
    // tenant config unavailable — env fallback below
  }

  if (tenantKey && isOpenAIBaseUrl(tenantBase)) {
    return { apiKey: tenantKey, baseUrl: tenantBase };
  }

  const envKey = process.env.REALTIME_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const envBase =
    process.env.REALTIME_BASE_URL?.replace(/\/+$/, "") ||
    "https://api.openai.com/v1";
  return { apiKey: envKey, baseUrl: envBase };
}

function isRealtimeConfigured(auth: ResolvedRealtimeAuth): boolean {
  return Boolean(auth.apiKey);
}

/**
 * Creates an ephemeral Realtime session. Returns null when Realtime is not
 * configured (no key) or the vendor call fails — the caller must fail closed
 * and surface the error to staff, never fall back to sharing the API key.
 */
export async function createRealtimeSession(
  tenantId: number,
  config: VoiceAgentConfig,
): Promise<RealtimeSessionSecret | null> {
  const auth = await resolveRealtimeAuth(tenantId);
  if (!isRealtimeConfigured(auth)) {
    logger.warn({ tenantId }, "[voice] realtime not configured (no API key)");
    return null;
  }

  const url = `${auth.baseUrl}${REALTIME_SESSIONS_PATH}`;
  const body = {
    model: config.model,
    voice: config.voice,
    modalities: ["audio", "text"],
    instructions: config.instructions,
    tools: config.tools,
    tool_choice: "auto",
    temperature: config.temperature ?? 0.6,
    input_audio_transcription: { model: "whisper-1" },
    turn_detection: { type: "server_vad" },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      logger.error(
        { tenantId, status: response.status, error: errorText },
        "[voice] realtime session creation failed",
      );
      return null;
    }

    const data = (await response.json()) as {
      id?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
    };

    const clientSecret = data.client_secret?.value;
    if (!clientSecret) {
      logger.error({ tenantId }, "[voice] realtime response missing client_secret");
      return null;
    }

    return {
      clientSecret,
      expiresAt:
        data.client_secret?.expires_at ??
        data.expires_at ??
        Math.floor(Date.now() / 1000) + 60,
      sessionId: data.id ?? null,
    };
  } catch (error) {
    logger.error({ error, tenantId }, "[voice] realtime session request errored");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
