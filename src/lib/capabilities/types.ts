// ─── Capability contract ─────────────────────────────────────────────────────
//
// A capability is a provider-neutral unit of agency: a name, a description, a
// JSON-schema argument contract, the surfaces/roles it is allowed on, and a
// tenant-scoped executor. The WhatsApp AI-SDK tools are one projection of this
// contract; the internal voice agent (OpenAI Realtime function calling) is
// another. Describing capabilities once is what lets both agents share the
// same tools, data and vector store.

/** Where the agent runs. */
export type AgentSurface = "customer" | "internal";

/** Roles recognised by the internal surface (aligned with userRoleEnum). */
export type CapabilityRole = "owner" | "admin" | "viewer";

export interface CapabilityContext {
  tenantId: number;
  surface: AgentSurface;
  /** Caller role, for internal role-gating. */
  role?: CapabilityRole;
  /** Customer phone on the customer surface. */
  phone?: string;
  /** Free-form, surface-specific context (conversationId, staffId, ...). */
  metadata?: Record<string, unknown>;
}

/** Compact, JSON-friendly result — it goes into a model's context. */
export type CapabilityResult = Record<string, unknown>;

export interface CapabilityDescriptor {
  /** Stable tool/function name, e.g. "searchKnowledge". */
  name: string;
  description: string;
  /** JSON Schema for the arguments (provider-neutral). */
  parameters: Record<string, unknown>;
  /** Surfaces this capability may be offered on. */
  surfaces: AgentSurface[];
  /** Allowed roles on the internal surface; omitted = every role. */
  roles?: CapabilityRole[];
  /** Tenant-scoped execution. `ctx.tenantId` is the isolation boundary. */
  execute: (
    ctx: CapabilityContext,
    args: Record<string, unknown>,
  ) => Promise<CapabilityResult>;
}
