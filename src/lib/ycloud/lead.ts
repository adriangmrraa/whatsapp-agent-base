import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizePhone } from "./phone";

export interface CaptureOrUpdateLeadOptions {
  /** Customer name from the inbound message profile (only set on first capture). */
  name?: string;
  /** First message text (only set on first capture). */
  firstMessage?: string;
}

/**
 * Upsert a lead record by normalized phone number.
 *
 * - If a lead with the same phone exists, updates `name` and `firstMessage`
 *   ONLY when the existing values are null (never overwrites existing data).
 * - If no lead exists, creates one with `status: "new"`.
 *
 * @returns The lead id.
 */
export async function captureOrUpdateLead(
  phone: string,
  tenantId: number,
  options?: CaptureOrUpdateLeadOptions,
): Promise<number> {
  const normalizedPhone = normalizePhone(phone);

  // Try to find existing lead
  const existing = await db
    .select({ id: leads.id, name: leads.name, firstMessage: leads.firstMessage })
    .from(leads)
    .where(and(eq(leads.phone, normalizedPhone), eq(leads.tenantId, tenantId)))
    .limit(1);

  if (existing.length > 0) {
    const lead = existing[0];

    // Only set fields that are still null on the existing record
    const patch: Partial<typeof leads.$inferInsert> = {};

    if (options?.name && !lead.name) {
      patch.name = options.name;
    }
    if (options?.firstMessage && !lead.firstMessage) {
      patch.firstMessage = options.firstMessage;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(leads).set(patch).where(eq(leads.id, lead.id));
    }

    return lead.id;
  }

  // Create new lead
  const [created] = await db
    .insert(leads)
    .values({
      tenantId,
      phone: normalizedPhone,
      name: options?.name ?? null,
      firstMessage: options?.firstMessage ?? null,
      status: "new",
    })
    .returning({ id: leads.id });

  return created.id;
}
