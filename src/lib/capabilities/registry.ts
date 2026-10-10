import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { retrieveKnowledge } from "@/lib/embeddings";
import { getStructuredOrderByReference } from "@/lib/storefront/context";
import type {
  AgentSurface,
  CapabilityContext,
  CapabilityDescriptor,
  CapabilityResult,
  CapabilityRole,
} from "./types";

// ─── Capability registry ─────────────────────────────────────────────────────
//
// The neutral description of what the engine can do. `selectCapabilities`
// filters by surface + role; `toRealtimeTools` / `toChatTools` project the
// result into provider-specific function-calling formats.
//
// The customer WhatsApp agent still ships its full AI-SDK toolset in
// src/lib/agent/tools.ts (which delegates to the same helpers — e.g.
// searchKnowledge → retrieveKnowledge). This registry is the seam the internal
// voice agent, and the System One decision layer, use to reason about the same
// capabilities without knowing the transport.

const searchKnowledge: CapabilityDescriptor = {
  name: "searchKnowledge",
  description:
    "Search the business knowledge base (policies, FAQs, delivery rules, product notes) for facts relevant to a question.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up." },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum snippets to return.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  surfaces: ["customer", "internal"],
  async execute(ctx, args): Promise<CapabilityResult> {
    const query = String(args.query ?? "").trim();
    if (!query) return { found: false, matches: [] };
    const limit = Number(args.limit ?? 3);
    const { matches } = await retrieveKnowledge({
      tenantId: ctx.tenantId,
      query,
      k: Number.isFinite(limit) ? limit : 3,
    });
    return {
      found: matches.length > 0,
      matches: matches.map((match) => ({
        content: match.content,
        source: match.source,
        documentKey: match.documentKey,
        score: Number(match.score.toFixed(3)),
      })),
    };
  },
};

const listPendingOrders: CapabilityDescriptor = {
  name: "listPendingOrders",
  description:
    "List the tenant's pending orders. Internal staff use only — never exposed to customers.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  surfaces: ["internal"],
  roles: ["owner", "admin"],
  async execute(ctx, args): Promise<CapabilityResult> {
    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 50);
    const rows = await db
      .select({
        id: orders.id,
        customerName: orders.customerName,
        phoneNumber: orders.phoneNumber,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, ctx.tenantId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return { count: rows.length, orders: rows };
  },
};

const getStructuredOrder: CapabilityDescriptor = {
  name: "getStructuredOrder",
  description:
    "Retrieve a structured order captured from the public storefront by its WEB:<reference>, so the agent confirms the exact items, total and address instead of re-parsing free text.",
  parameters: {
    type: "object",
    properties: {
      reference: {
        type: "string",
        description: "The WEB:<reference> token from the customer's message.",
      },
    },
    required: ["reference"],
    additionalProperties: false,
  },
  surfaces: ["customer", "internal"],
  async execute(ctx, args): Promise<CapabilityResult> {
    const reference = String(args.reference ?? "").trim();
    if (!reference) return { found: false };
    const order = await getStructuredOrderByReference(ctx.tenantId, reference);
    if (!order) return { found: false, reference };
    return { found: true, order };
  },
};

const CAPABILITIES: CapabilityDescriptor[] = [
  searchKnowledge,
  listPendingOrders,
  getStructuredOrder,
];

/** Capabilities available to a given context (surface + role gating). */
export function selectCapabilities(ctx: CapabilityContext): CapabilityDescriptor[] {
  return CAPABILITIES.filter((capability) => {
    if (!capability.surfaces.includes(ctx.surface)) return false;
    if (ctx.surface === "internal" && capability.roles) {
      return ctx.role != null && capability.roles.includes(ctx.role);
    }
    return true;
  });
}

export function allCapabilities(): CapabilityDescriptor[] {
  return [...CAPABILITIES];
}

export function getCapability(name: string): CapabilityDescriptor | null {
  return CAPABILITIES.find((capability) => capability.name === name) ?? null;
}

/** Execute a capability by name within a tenant-scoped context. */
export async function executeCapability(
  ctx: CapabilityContext,
  name: string,
  args: Record<string, unknown>,
): Promise<CapabilityResult> {
  const allowed = selectCapabilities(ctx).some((capability) => capability.name === name);
  if (!allowed) return { error: "capability_not_available", capability: name };
  const capability = getCapability(name);
  if (!capability) return { error: "capability_not_found", capability: name };
  return capability.execute(ctx, args);
}

// ─── Provider projections ────────────────────────────────────────────────────

/** OpenAI Realtime / Responses function-calling shape. */
export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** OpenAI Chat Completions tools shape. */
export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function toRealtimeTools(
  descriptors: CapabilityDescriptor[],
): RealtimeToolDefinition[] {
  return descriptors.map((capability) => ({
    type: "function",
    name: capability.name,
    description: capability.description,
    parameters: capability.parameters,
  }));
}

export function toChatTools(
  descriptors: CapabilityDescriptor[],
): ChatToolDefinition[] {
  return descriptors.map((capability) => ({
    type: "function",
    function: {
      name: capability.name,
      description: capability.description,
      parameters: capability.parameters,
    },
  }));
}

export type { AgentSurface, CapabilityRole };
