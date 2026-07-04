"use server";

import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, desc, and, or, ilike, sql, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────────────────────────

export type LeadStatus = "new" | "contacted" | "converted" | "lost";

export interface FetchLeadsParams {
  status?: LeadStatus;
  page?: number;
  q?: string;
  pageSize?: number;
}

export interface CountsByStatus {
  new: number;
  contacted: number;
  converted: number;
  lost: number;
  total: number;
}

export interface LeadRow {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  firstMessage: string | null;
  refCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  adId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  platform: string | null;
  notes: string | null;
  status: LeadStatus;
  type: string | null;
  conversationId: number | null;
  tags: string[];
  createdAt: string;
}

export interface FetchLeadsResult {
  leads: LeadRow[];
  totalPages: number;
  countsByStatus: CountsByStatus;
}

// ─── Fetch Leads (paginated, filtered, searchable) ──────────────────────────

export async function fetchLeadsAction(
  params: FetchLeadsParams,
): Promise<FetchLeadsResult> {
  const { status, page = 1, q, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [];

  if (status) {
    conditions.push(eq(leads.status, status));
  }

  const searchConditions: ReturnType<typeof ilike>[] = [];
  if (q) {
    searchConditions.push(ilike(leads.name, `%${q}%`));
    searchConditions.push(ilike(leads.phone, `%${q}%`));
  }

  if (searchConditions.length > 0) {
    conditions.push(or(...searchConditions) as unknown as ReturnType<typeof eq>);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult, statusCounts] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(leads)
      .where(whereClause),
    db
      .select({
        status: leads.status,
        count: sql<number>`count(*)`,
      })
      .from(leads)
      .groupBy(leads.status),
  ]);

  const total = Number(countResult[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const countsByStatus: CountsByStatus = {
    new: 0,
    contacted: 0,
    converted: 0,
    lost: 0,
    total,
  };

  for (const row of statusCounts) {
    const s = row.status as LeadStatus;
    if (s in countsByStatus) {
      countsByStatus[s] = Number(row.count);
    }
  }

  return {
    leads: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      firstMessage: r.firstMessage,
      refCode: r.refCode,
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
      utmContent: r.utmContent,
      adId: r.adId,
      campaignId: r.campaignId,
      adsetId: r.adsetId,
      platform: r.platform,
      notes: r.notes,
      status: r.status as LeadStatus,
      type: r.type,
      conversationId: r.conversationId,
      tags: (r.tags ?? []) as string[],
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })) as LeadRow[],
    totalPages,
    countsByStatus,
  };
}

// ─── Get Single Lead ────────────────────────────────────────────────────────

export async function getLeadAction(id: number) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, id))
    .limit(1);

  return lead ?? null;
}

// ─── Update Lead (partial) ──────────────────────────────────────────────────

export async function updateLeadAction(
  id: number,
  data: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    status?: LeadStatus;
  },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status !== undefined) updateData.status = data.status;

  if (Object.keys(updateData).length === 0) return { success: true };

  await db
    .update(leads)
    .set(updateData)
    .where(eq(leads.id, id));

  revalidatePath("/admin/leads");
  return { success: true };
}

// ─── Delete Lead ────────────────────────────────────────────────────────────

export async function deleteLeadAction(id: number) {
  await db
    .delete(leads)
    .where(eq(leads.id, id));

  revalidatePath("/admin/leads");
  return { success: true };
}
