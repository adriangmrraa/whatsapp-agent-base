"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { promotions } from "@/db/schema";
import { eq, desc, count, and } from "drizzle-orm";
import { requireTenantId } from "@/lib/tenants";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PromoRow = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  customPrice: string | null;
  active: boolean;
  createdAt: Date;
};

export type PaginatedResult = {
  promotions: PromoRow[];
  total: number;
  page: number;
  totalPages: number;
};

// ─── Validation Schemas ────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  customPrice: z.number().positive("Price must be positive").optional(),
  imageUrl: z.string().optional(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  customPrice: z.number().optional(),
  imageUrl: z.string().optional(),
  active: z.boolean().optional(),
});

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Fetch (paginated) ──────────────────────────────────────────────────────

export async function fetchPromotionsAction({
  page = 1,
}: { page?: number } = {}): Promise<PaginatedResult> {
  const tenantId = await requireTenantId();
  const offset = (page - 1) * PAGE_SIZE;
  const where = eq(promotions.tenantId, tenantId);

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(promotions)
      .where(where)
      .orderBy(desc(promotions.createdAt))
      .limit(PAGE_SIZE)
      .offset(Math.max(0, offset)),
    db.select({ total: count() }).from(promotions).where(where),
  ]);

  const total = totalResult[0]?.total ?? 0;

  return {
    promotions: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      customPrice: r.customPrice,
      active: r.active,
      createdAt: r.createdAt,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPromotionAction(data: z.infer<typeof createSchema>) {
  const tenantId = await requireTenantId();
  const parsed = createSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid data",
    };
  }

  try {
    await db.insert(promotions).values({
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      customPrice:
        parsed.data.customPrice != null
          ? String(parsed.data.customPrice)
          : null,
      imageUrl: parsed.data.imageUrl ?? null,
      active: parsed.data.active ?? true,
    });

    revalidatePath("/admin/promotions");
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Failed to create promotion" };
  }
}

// ─── Update (partial) ──────────────────────────────────────────────────────

export async function updatePromotionAction(
  id: number,
  data: z.infer<typeof updateSchema>,
) {
  const tenantId = await requireTenantId();
  const parsed = updateSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid data",
    };
  }

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined)
      updates.description = parsed.data.description;
    if (parsed.data.customPrice !== undefined)
      updates.customPrice = String(parsed.data.customPrice);
    if (parsed.data.imageUrl !== undefined)
      updates.imageUrl = parsed.data.imageUrl;
    if (parsed.data.active !== undefined) updates.active = parsed.data.active;

    await db
      .update(promotions)
      .set(updates)
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)));

    revalidatePath("/admin/promotions");
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Failed to update promotion" };
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deletePromotionAction(id: number) {
  const tenantId = await requireTenantId();
  try {
    await db
      .delete(promotions)
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)));
    revalidatePath("/admin/promotions");
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Failed to delete promotion" };
  }
}

// ─── Toggle Active ───────────────────────────────────────────────────────────

export async function togglePromotionActiveAction(id: number, active: boolean) {
  const tenantId = await requireTenantId();
  try {
    await db
      .update(promotions)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)));

    revalidatePath("/admin/promotions");
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error: "Failed to toggle promotion status",
    };
  }
}
