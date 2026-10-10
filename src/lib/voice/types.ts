import type { CapabilityRole } from "@/lib/capabilities/types";
import type { RealtimeToolDefinition } from "@/lib/capabilities/registry";

// ─── Internal voice agent contract (OpenAI Realtime) ─────────────────────────
//
// Staff-facing speech-to-speech agent. It reuses the SAME capability registry
// and vector store as the customer agent — voice is just another surface. The
// Realtime session is fed a model, instructions, a voice and the function
// definitions; tool calls are executed through the local capability runner.

export interface VoiceAgentConfig {
  model: string;
  voice: string;
  instructions: string;
  tools: RealtimeToolDefinition[];
  temperature?: number;
}

export interface VoiceAgentBuildInput {
  tenantId: number;
  /** Staff role used to gate internal capabilities. */
  role?: CapabilityRole;
  /** Base instructions (persona, tenant, business context). */
  instructions: string;
  model?: string;
  voice?: string;
}
