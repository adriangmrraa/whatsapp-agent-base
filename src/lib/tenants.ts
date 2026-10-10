import { cache } from "react";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { tenants, channels, agentConfig } from "@/db/schema";
import { auth } from "@/auth";
import logger from "@/lib/logger";
import type { ChannelProvider } from "@/lib/providers/types";

// ─── Tenant resolution ──────────────────────────────────────────────────────
//
// Inbound webhooks resolve the owning tenant through `channels`
// (provider + externalId). Admin requests resolve it through the session.

export interface ResolvedChannel {
  tenantId: number;
  channelId: number;
  provider: ChannelProvider;
  externalId: string;
  config: Record<string, unknown>;
}

/**
 * Find the channel row matching a provider identity — e.g. the business
 * phone number a YCloud message was sent TO, the Meta phone_number_id, or
 * a Chatwoot inbox id.
 */
export async function resolveChannel(
  provider: ChannelProvider,
  externalId: string,
): Promise<ResolvedChannel | null> {
  if (!externalId) return null;
  const [row] = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.provider, provider),
        eq(channels.externalId, externalId),
        eq(channels.isActive, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    tenantId: row.tenantId,
    channelId: row.id,
    provider: row.provider,
    externalId: row.externalId,
    config: (row.config as Record<string, unknown>) ?? {},
  };
}

/**
 * Fallback tenant for single-tenant-style deployments where no channel row
 * matched: DEFAULT_TENANT_SLUG env → first tenant in the table.
 */
export async function getDefaultTenantId(): Promise<number | null> {
  const slug = process.env.DEFAULT_TENANT_SLUG;
  if (slug) {
    const [t] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (t) return t.id;
  }
  const [first] = await db.select({ id: tenants.id }).from(tenants).limit(1);
  return first?.id ?? null;
}

/** Registers a channel row if it doesn't exist yet (idempotent). */
export async function ensureChannel(input: {
  tenantId: number;
  provider: ChannelProvider;
  externalId: string;
  displayName?: string;
  config?: Record<string, unknown>;
}): Promise<number> {
  const existing = await resolveChannel(input.provider, input.externalId);
  if (existing) return existing.channelId;

  const [row] = await db
    .insert(channels)
    .values({
      tenantId: input.tenantId,
      provider: input.provider,
      externalId: input.externalId,
      displayName: input.displayName ?? null,
      config: input.config ?? {},
      isActive: true,
    })
    .onConflictDoNothing()
    .returning({ id: channels.id });

  if (row) return row.id;
  const retry = await resolveChannel(input.provider, input.externalId);
  return retry?.channelId ?? 0;
}

// ─── Session-scoped tenant (admin) ─────────────────────────────────────────

/** Resolves the tenantId for the currently authenticated admin user. */
export const getSessionTenantId = cache(async (): Promise<number | null> => {
  const session = await auth();
  const tid = (session?.user as { tenantId?: number } | undefined)?.tenantId;
  return typeof tid === "number" && tid > 0 ? tid : null;
});

/** Throws when there is no authenticated tenant — use in server actions. */
export async function requireTenantId(): Promise<number> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    throw new Error("Unauthorized: no tenant in session");
  }
  return tenantId;
}

// ─── Per-tenant agent config ────────────────────────────────────────────────

export type AgentConfigRow = typeof agentConfig.$inferSelect;

const configCache = new Map<number, { at: number; value: AgentConfigRow | null }>();
const CONFIG_TTL_MS = 15_000;

export function invalidateAgentConfigCache(tenantId: number): void {
  configCache.delete(tenantId);
}

export async function getAgentConfig(
  tenantId: number,
): Promise<AgentConfigRow | null> {
  const hit = configCache.get(tenantId);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;
  try {
    const [row] = await db
      .select()
      .from(agentConfig)
      .where(eq(agentConfig.tenantId, tenantId))
      .limit(1);
    const value = row ?? null;
    configCache.set(tenantId, { at: Date.now(), value });
    return value;
  } catch (error) {
    logger.error({ error, tenantId }, "[tenants] getAgentConfig failed");
    return null;
  }
}
