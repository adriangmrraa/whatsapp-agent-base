"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderStatusEnum } from "@/db/schema";
import { eq, desc, and, count, ilike, or, sql, type SQL } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type OrderStatus = "pending" | "preparing" | "ready" | "delivered" | "cancelled";

export interface OrderRow {
  id: number;
  phoneNumber: string;
  customerName: string | null;
  address: string | null;
  orderType: string | null;
  items: unknown;
  notes: string | null;
  tags: string[] | null;
  status: string;
  leadId: number | null;
  deliveryFee: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  deliveredAt: Date | null;
  followupSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FetchOrdersResponse {
  orders: OrderRow[];
  totalPages: number;
  countsByStatus: Record<string, number>;
}

const PAGE_SIZE = 20;

// ─── Valid transitions ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

// ─── Fetch Orders ───────────────────────────────────────────────────────────────

export async function fetchOrdersAction(params: {
  status?: string;
  paymentStatus?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<FetchOrdersResponse> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];

  if (params.status && ["pending", "preparing", "ready", "delivered", "cancelled"].includes(params.status)) {
    conditions.push(eq(orders.status, params.status as OrderStatus));
  }

  if (params.paymentStatus) {
    conditions.push(eq(orders.paymentStatus, params.paymentStatus));
  }

  if (params.q) {
    const s = `%${params.q}%`;
    conditions.push(
      or(
        ilike(orders.customerName ?? "", s),
        ilike(orders.phoneNumber, s),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions)! : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(whereClause),
  ]);

  const total = countResult[0]?.total ?? 0;

  // Global counts by status (independent of current filter)
  const statuses = ["pending", "preparing", "ready", "delivered", "cancelled"] as const;
  const countsByStatus: Record<string, number> = {};

  const statusCounts = await Promise.all(
    statuses.map(async (s) => {
      const [r] = await db
        .select({ n: count() })
        .from(orders)
        .where(eq(orders.status, s));
      return { status: s, count: Number(r?.n ?? 0) };
    }),
  );

  for (const sc of statusCounts) {
    countsByStatus[sc.status] = sc.count;
  }

  return {
    orders: rows as unknown as OrderRow[],
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    countsByStatus,
  };
}

// ─── Update Order Status ────────────────────────────────────────────────────────

export async function updateOrderStatusAction(
  id: number,
  newStatus: OrderStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Cannot transition from "${order.status}" to "${newStatus}"`,
      };
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === "delivered") {
      updateData.deliveredAt = new Date();
    }

    await db.update(orders).set(updateData).where(eq(orders.id, id));

    revalidatePath("/admin/orders");
    return { success: true };
  } catch (e) {
    console.error("[updateOrderStatusAction] Error:", e);
    return { success: false, error: "Failed to update order status" };
  }
}

// ─── Mark Order Payment ─────────────────────────────────────────────────────────

export async function markOrderPaymentAction(
  id: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const [order] = await db
      .select({ status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      return { success: false, error: "Order not found" };
    }

    const updateData: Record<string, unknown> = {
      paymentStatus: "paid",
      updatedAt: new Date(),
    };

    // If status is pending, advance to preparing
    if (order.status === "pending") {
      updateData.status = "preparing";
    }

    await db.update(orders).set(updateData).where(eq(orders.id, id));

    revalidatePath("/admin/orders");
    return { success: true };
  } catch (e) {
    console.error("[markOrderPaymentAction] Error:", e);
    return { success: false, error: "Failed to mark order as paid" };
  }
}

// ─── Delete Order ───────────────────────────────────────────────────────────────

export async function deleteOrderAction(
  id: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.delete(orders).where(eq(orders.id, id));
    revalidatePath("/admin/orders");
    return { success: true };
  } catch (e) {
    console.error("[deleteOrderAction] Error:", e);
    return { success: false, error: "Failed to delete order" };
  }
}
