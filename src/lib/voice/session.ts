import {
  executeCapability,
  selectCapabilities,
  toRealtimeTools,
} from "@/lib/capabilities/registry";
import type { CapabilityContext, CapabilityResult } from "@/lib/capabilities/types";
import type { VoiceAgentBuildInput, VoiceAgentConfig } from "./types";

// ─── Internal voice agent builder ────────────────────────────────────────────
//
// Composes the Realtime session config from the neutral capability registry:
// the same tools/data/vector store the customer agent uses, gated by staff
// role. The actual WebSocket/session plumbing is intentionally not implemented
// here — this is the reusable seam the future implementation plugs into.

const DEFAULT_MODEL =
  process.env.REALTIME_MODEL ?? "gpt-4o-realtime-preview";
const DEFAULT_VOICE = process.env.REALTIME_VOICE ?? "alloy";

export function buildInternalVoiceAgent(
  input: VoiceAgentBuildInput,
): VoiceAgentConfig {
  const ctx: CapabilityContext = {
    tenantId: input.tenantId,
    surface: "internal",
    role: input.role,
  };
  return {
    model: input.model ?? DEFAULT_MODEL,
    voice: input.voice ?? DEFAULT_VOICE,
    instructions: input.instructions,
    tools: toRealtimeTools(selectCapabilities(ctx)),
    temperature: 0.6,
  };
}

/**
 * The tool-execution bridge a Realtime session calls on a function call.
 * Tenant-scoped and role-gated by construction; unknown/disallowed names
 * return an error object instead of touching data.
 */
export function createVoiceToolRunner(input: {
  tenantId: number;
  role?: CapabilityContext["role"];
}) {
  const ctx: CapabilityContext = {
    tenantId: input.tenantId,
    surface: "internal",
    role: input.role,
  };
  return async function runTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CapabilityResult> {
    return executeCapability(ctx, name, args ?? {});
  };
}
