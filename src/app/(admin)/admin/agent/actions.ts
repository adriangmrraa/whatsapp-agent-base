"use server";

import { db } from "@/db";
import { agentConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentConfigData = typeof agentConfig.$inferSelect;
export type AgentConfigInput = typeof agentConfig.$inferInsert;

// ─── Get Config ────────────────────────────────────────────────────────────

export async function getConfigAction(): Promise<AgentConfigData | null> {
  const [config] = await db.select().from(agentConfig).limit(1);
  return config ?? null;
}

// ─── Save Config (Upsert) ──────────────────────────────────────────────────

export async function saveConfigAction(
  data: Partial<AgentConfigInput>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const [existing] = await db
      .select({ id: agentConfig.id })
      .from(agentConfig)
      .limit(1);

    if (existing) {
      await db
        .update(agentConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentConfig.id, existing.id));
    } else {
      await db
        .insert(agentConfig)
        .values(data as AgentConfigInput);
    }

    revalidatePath("/admin/agent");
    return { success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error desconocido al guardar configuración";
    return { success: false, error: message };
  }
}
