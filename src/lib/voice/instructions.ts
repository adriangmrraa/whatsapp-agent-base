import { getAgentConfig } from "@/lib/tenants";
import type { CapabilityRole } from "@/lib/capabilities/types";

// ─── Internal voice agent instructions ───────────────────────────────────────
//
// Builds the system instructions for the staff-facing Realtime session from the
// tenant's own config — never hardcoded business assumptions. The same config
// drives the customer agent, so the two agents stay consistent.

const ROLE_GUIDANCE: Record<CapabilityRole, string> = {
  owner:
    "You serve the business owner: you may read and act on any tenant data the tools expose.",
  admin:
    "You serve an administrator: you may read and act on operational data; escalate anything that changes money or access policy.",
  viewer:
    "You serve a read-only staff member: answer questions and summarize data, but do not perform mutations.",
};

export interface BuildVoiceInstructionsInput {
  tenantId: number;
  role?: CapabilityRole;
}

/**
 * Composes the base instructions for the internal voice agent. Tenant-scoped:
 * reads only the caller's own agent_config row.
 */
export async function buildVoiceInstructions(
  input: BuildVoiceInstructionsInput,
): Promise<string> {
  const config = await getAgentConfig(input.tenantId).catch(() => null);

  const businessName = config?.metaBusinessName?.trim() || "the business";
  const hours = config?.operatingHours?.trim();
  const wait = config?.estimatedWaitTime?.trim();

  const lines: string[] = [
    `You are the internal voice assistant for ${businessName}.`,
    "You help staff get answers and take actions by calling the provided tools. Never invent data.",
    "When a tool returns facts, base your answer on them. When a tool errors, say so plainly and suggest the next step.",
    "Confirm with the operator before any action that changes state (creating or modifying an order).",
    "Keep replies short and spoken-friendly: no markdown, no emoji, no bullet symbols.",
  ];

  if (input.role && ROLE_GUIDANCE[input.role]) {
    lines.push(ROLE_GUIDANCE[input.role]);
  }

  const facts: string[] = [];
  if (hours) facts.push(`Operating hours: ${hours}.`);
  if (wait) facts.push(`Estimated wait time: ${wait}.`);
  if (facts.length > 0) {
    lines.push(`Known business facts — ${facts.join(" ")}`);
  }

  return lines.join("\n");
}
