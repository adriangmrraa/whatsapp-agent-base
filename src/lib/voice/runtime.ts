import { randomUUID } from "crypto";
import type { CapabilityRole } from "@/lib/capabilities/types";
import { buildInternalVoiceAgent, createVoiceToolRunner } from "./session";
import { buildVoiceInstructions } from "./instructions";
import { createRealtimeSession } from "./realtime";
import {
  registerVoiceSession,
  validateVoiceSession,
  closeVoiceSession,
} from "./session-store";
import type { RealtimeToolDefinition } from "@/lib/capabilities/registry";

// ─── Internal voice agent runtime ────────────────────────────────────────────
//
// Orchestrates the Realtime session lifecycle end to end:
//   createVoiceSession  → build config (role-gated capabilities) + mint secret
//                       → register the session for tool-call binding
//   runVoiceToolCall    → validate the session, then execute the capability
//   endVoiceSession     → release the session
//
// The browser owns the WebRTC audio transport (see ./client.ts); the server
// owns the key, the instructions, the role gate and every tool execution.

export interface VoiceSessionStartResult {
  sessionId: string;
  clientSecret: string;
  model: string;
  voice: string;
  expiresAt: number;
  tools: RealtimeToolDefinition[];
}

export type StartVoiceSessionOutcome =
  | { ok: true; session: VoiceSessionStartResult }
  | { ok: false; error: string };

export async function startVoiceSession(input: {
  tenantId: number;
  role: CapabilityRole;
}): Promise<StartVoiceSessionOutcome> {
  const instructions = await buildVoiceInstructions({
    tenantId: input.tenantId,
    role: input.role,
  });

  const config = buildInternalVoiceAgent({
    tenantId: input.tenantId,
    role: input.role,
    instructions,
  });

  const secret = await createRealtimeSession(input.tenantId, config);
  if (!secret) {
    return { ok: false, error: "realtime_unavailable" };
  }

  const sessionId = `vs_${randomUUID()}`;
  registerVoiceSession({
    sessionId,
    tenantId: input.tenantId,
    role: input.role,
    expiresAt: secret.expiresAt,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    session: {
      sessionId,
      clientSecret: secret.clientSecret,
      model: config.model,
      voice: config.voice,
      expiresAt: secret.expiresAt,
      tools: config.tools,
    },
  };
}

export async function endVoiceSession(sessionId: string): Promise<void> {
  closeVoiceSession(sessionId);
}

export type VoiceToolCallOutcome =
  | { ok: true; callId: string; result: Record<string, unknown> }
  | { ok: false; callId?: string; error: string };

/**
 * Executes one Realtime function call. The session must be live and owned by
 * the authenticated tenant; the role is taken from the SERVER-side session
 * record (never the request body), so a client cannot escalate capabilities.
 */
export async function runVoiceToolCall(input: {
  tenantId: number;
  sessionId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
}): Promise<VoiceToolCallOutcome> {
  const record = validateVoiceSession(input.sessionId, input.tenantId);
  if (!record) {
    return { ok: false, callId: input.callId, error: "invalid_session" };
  }

  const runTool = createVoiceToolRunner({
    tenantId: input.tenantId,
    role: record.role,
  });

  const result = await runTool(input.name, input.args ?? {});
  if (typeof result.error === "string") {
    return { ok: false, callId: input.callId, error: result.error };
  }
  return { ok: true, callId: input.callId, result };
}
