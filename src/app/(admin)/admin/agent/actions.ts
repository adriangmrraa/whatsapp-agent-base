"use server";

import { db } from "@/db";
import { agentConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenantId, invalidateAgentConfigCache } from "@/lib/tenants";
import { invalidateAIConfigCache } from "@/lib/ai/config";
import { encrypt, decryptIfEncrypted } from "@/lib/encryption";
import { invalidateDecisionConfigCache } from "@/lib/system-one/config";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentConfigData = typeof agentConfig.$inferSelect;
export type AgentConfigInput = typeof agentConfig.$inferInsert;

const SECRET_KEYS = [
  "aiApiKey",
  "telegramBotToken",
  "decisionApiKey",
] as const;

function maskSecrets(config: AgentConfigData | null): AgentConfigData | null {
  if (!config) return config;
  const masked = { ...config } as Record<string, unknown>;
  for (const key of SECRET_KEYS) {
    const raw = masked[key];
    if (typeof raw === "string" && raw.length > 0) {
      masked[key] = "********"; // never ship secrets to the client
    }
  }
  return masked as AgentConfigData;
}

// ─── Get Config ────────────────────────────────────────────────────────────

export async function getConfigAction(): Promise<AgentConfigData | null> {
  const tenantId = await requireTenantId();
  const [config] = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId))
    .limit(1);
  return maskSecrets(config ?? null);
}

// ─── Save Config (Upsert) ──────────────────────────────────────────────────

export async function saveConfigAction(
  data: Partial<AgentConfigInput>,
): Promise<{ success: boolean; error?: string }> {
  const tenantId = await requireTenantId();

  try {
    // Encrypt secret fields; a masked placeholder means "keep current value".
    const payload = { ...data } as Record<string, unknown>;
    for (const key of SECRET_KEYS) {
      const raw = payload[key];
      if (typeof raw === "string") {
        if (raw === "********" || raw.trim() === "") {
          delete payload[key];
        } else {
          payload[key] = encrypt(raw);
        }
      }
    }

    const [existing] = await db
      .select({ id: agentConfig.id })
      .from(agentConfig)
      .where(eq(agentConfig.tenantId, tenantId))
      .limit(1);

    if (existing) {
      await db
        .update(agentConfig)
        .set({ ...(payload as Partial<AgentConfigInput>), updatedAt: new Date() })
        .where(eq(agentConfig.tenantId, tenantId));
    } else {
      await db.insert(agentConfig).values({
        ...(payload as AgentConfigInput),
        tenantId,
      });
    }

    invalidateAgentConfigCache(tenantId);
    invalidateAIConfigCache(tenantId);
    invalidateDecisionConfigCache(tenantId);
    revalidatePath("/admin/agent");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error desconocido al guardar configuración";
    return { success: false, error: message };
  }
}

// ─── Helpers for server components needing the raw secret ─────────────────

export async function getDecryptedAiKey(tenantId: number): Promise<string> {
  const [config] = await db
    .select({ aiApiKey: agentConfig.aiApiKey })
    .from(agentConfig)
    .where(eq(agentConfig.tenantId, tenantId))
    .limit(1);
  return decryptIfEncrypted(config?.aiApiKey ?? "");
}
