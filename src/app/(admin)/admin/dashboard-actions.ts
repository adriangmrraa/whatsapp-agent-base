"use server";

import { db } from "@/db";
import { orders, leads, conversations } from "@/db/schema";
import { sql, eq, desc, gte, lt, and, or } from "drizzle-orm";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/tenants";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalOrders: number;
  ordersToday: number;
  newClients7d: number;
  totalLeads: number;
}

export interface ActivityItem {
  type: "lead" | "order";
  id: number;
  name: string | null;
  phone: string;
  createdAt: Date;
  timeLabel: string;
}

export interface ActionCardItem {
  id: string | number;
  label: string;
  subtitle: string;
  phone?: string;
  conversationId?: number;
  orderId?: number;
  type: "order" | "chat" | "lead";
}

export interface ActionCard {
  id: string;
  icon: string;
  title: string;
  color: "red" | "amber" | "blue" | "green";
  items: ActionCardItem[];
  actions: { label: string; action: string }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function tiempoRelativo(fecha: Date): string {
  const ahora = new Date();
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHoras < 24) return `hace ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;
  return `hace ${diffDias} ${diffDias === 1 ? "día" : "días"}`;
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export async function getStatsAction(): Promise<DashboardStats> {
  const tenantId = await requireTenantId();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalOrdersRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));

  const [ordersTodayRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, todayStart)));

  const [newClientsRes] = await db
    .select({ count: sql<number>`count(distinct ${leads.phone})` })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, weekAgo)));

  const [totalLeadsRes] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(eq(leads.tenantId, tenantId));

  return {
    totalOrders: Number(totalOrdersRes?.count ?? 0),
    ordersToday: Number(ordersTodayRes?.count ?? 0),
    newClients7d: Number(newClientsRes?.count ?? 0),
    totalLeads: Number(totalLeadsRes?.count ?? 0),
  };
}

// ─── Recent Activity ───────────────────────────────────────────────────────

export async function getRecentActivityAction(): Promise<ActivityItem[]> {
  const tenantId = await requireTenantId();
  const [recentLeads, recentOrders] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(5),
    db
      .select({
        id: orders.id,
        name: orders.customerName,
        phone: orders.phoneNumber,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt))
      .limit(5),
  ]);

  const leadsItems: ActivityItem[] = recentLeads.map((l) => ({
    type: "lead",
    id: l.id,
    name: l.name,
    phone: l.phone,
    createdAt: l.createdAt,
    timeLabel: tiempoRelativo(l.createdAt),
  }));

  const ordersItems: ActivityItem[] = recentOrders.map((o) => ({
    type: "order",
    id: o.id,
    name: o.name,
    phone: o.phone,
    createdAt: o.createdAt,
    timeLabel: tiempoRelativo(o.createdAt),
  }));

  return [...leadsItems, ...ordersItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);
}

// ─── Action Cards ─────────────────────────────────────────────────────────

export async function getActionCardsAction(): Promise<ActionCard[]> {
  const tenantId = await requireTenantId();
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const twentyFourHAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [readyOrders, stuckPreparing, unpaidOrders, staleConversations, freshLeads] =
    await Promise.all([
      // Pedidos listos (status = ready)
      db
        .select({
          id: orders.id,
          customerName: orders.customerName,
          phoneNumber: orders.phoneNumber,
          orderType: orders.orderType,
          address: orders.address,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(eq(orders.status, "ready"), eq(orders.tenantId, tenantId)))
        .orderBy(desc(orders.createdAt))
        .limit(5),

      // En preparación hace rato (> 30min)
      db
        .select({
          id: orders.id,
          customerName: orders.customerName,
          phoneNumber: orders.phoneNumber,
          orderType: orders.orderType,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(eq(orders.status, "preparing"), lt(orders.createdAt, thirtyMinAgo), eq(orders.tenantId, tenantId)))
        .orderBy(desc(orders.createdAt))
        .limit(5),

      // Pagos pendientes (paymentStatus = pending, order activo)
      db
        .select({
          id: orders.id,
          customerName: orders.customerName,
          phoneNumber: orders.phoneNumber,
          orderType: orders.orderType,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.paymentStatus, "pending"),
            or(eq(orders.status, "pending"), eq(orders.status, "preparing"), eq(orders.status, "ready")),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(5),

      // Chats sin actividad > 24h
      db
        .select({
          id: conversations.id,
          customerName: conversations.customerName,
          customerPhone: conversations.customerPhone,
          lastMessageAt: conversations.lastMessageAt,
        })
        .from(conversations)
        .where(
          and(eq(conversations.tenantId, tenantId), eq(conversations.status, "active"), lt(conversations.lastMessageAt, twentyFourHAgo)),
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(5),

      // Leads nuevos (< 24h)
      db
        .select({
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.status, "new"), gte(leads.createdAt, twentyFourHAgo)))
        .orderBy(desc(leads.createdAt))
        .limit(5),
    ]);

  const cards: ActionCard[] = [];

  if (readyOrders.length > 0) {
    cards.push({
      id: "ready",
      icon: "check-circle",
      title: "Listos para entregar",
      color: "green",
      items: readyOrders.map((o) => ({
        id: o.id,
        label: o.customerName || "Sin nombre",
        subtitle: `#${o.id}${o.address ? " · Delivery" : ""}`,
        phone: o.phoneNumber,
        orderId: o.id,
        type: "order",
      })),
      actions: [{ label: "Marcar Entregado", action: "mark-delivered" }],
    });
  }

  if (stuckPreparing.length > 0) {
    cards.push({
      id: "stuck",
      icon: "clock",
      title: "Preparando hace rato",
      color: "amber",
      items: stuckPreparing.map((o) => ({
        id: o.id,
        label: o.customerName || "Sin nombre",
        subtitle: `#${o.id} · ${tiempoRelativo(o.createdAt)}`,
        phone: o.phoneNumber,
        orderId: o.id,
        type: "order",
      })),
      actions: [{ label: "Marcar Listo", action: "mark-ready" }],
    });
  }

  if (unpaidOrders.length > 0) {
    cards.push({
      id: "unpaid",
      icon: "dollar-sign",
      title: "Pagos pendientes",
      color: "red",
      items: unpaidOrders.map((o) => ({
        id: o.id,
        label: o.customerName || "Sin nombre",
        subtitle: `#${o.id}`,
        phone: o.phoneNumber,
        orderId: o.id,
        type: "order",
      })),
      actions: [{ label: "Marcar Pagado", action: "mark-paid" }],
    });
  }

  if (staleConversations.length > 0) {
    cards.push({
      id: "stale-chats",
      icon: "message-square",
      title: "Chats sin actividad",
      color: "amber",
      items: staleConversations.map((c) => ({
        id: c.id,
        label: c.customerName || "Sin nombre",
        subtitle: c.customerPhone || "",
        phone: c.customerPhone || undefined,
        conversationId: c.id,
        type: "chat",
      })),
      actions: [{ label: "Abrir Chat", action: "open-chat" }],
    });
  }

  if (freshLeads.length > 0) {
    cards.push({
      id: "fresh-leads",
      icon: "user-plus",
      title: "Leads nuevos",
      color: "blue",
      items: freshLeads.map((l) => ({
        id: l.id,
        label: l.name || "Sin nombre",
        subtitle: l.phone,
        phone: l.phone,
        type: "lead",
      })),
      actions: [{ label: "Ver Lead", action: "view-lead" }],
    });
  }

  return cards;
}

// ─── Order Server Actions ──────────────────────────────────────────────────

function isCashOnDelivery(paymentMethod: string | null): boolean {
  if (!paymentMethod) return true;
  const cashMethods = [
    "efectivo",
    "contra entrega",
    "en efectivo",
    "al recibir",
    "cash",
    "cash_on_delivery",
  ];
  return cashMethods.includes(paymentMethod.toLowerCase().trim());
}

export async function markOrderDeliveredAction(
  orderId: number,
): Promise<{ success: boolean; error?: string }> {
  const tenantId = await requireTenantId();

  try {
    const [order] = await db
      .select({
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!order) return { success: false, error: "Pedido no encontrado" };

    const isCod =
      isCashOnDelivery(order.paymentMethod) &&
      order.paymentStatus === "pending";

    await db
      .update(orders)
      .set({
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
        ...(isCod ? { paymentStatus: "paid" } : {}),
      })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

    revalidatePath("/admin");
    return { success: true };
  } catch {
    return { success: false, error: "Error al marcar como entregado" };
  }
}

export async function markOrderReadyAction(
  orderId: number,
): Promise<{ success: boolean; error?: string }> {
  const tenantId = await requireTenantId();

  try {
    await db
      .update(orders)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

    revalidatePath("/admin");
    return { success: true };
  } catch {
    return { success: false, error: "Error al marcar como listo" };
  }
}

export async function markOrderPaidAction(
  orderId: number,
): Promise<{ success: boolean; error?: string }> {
  const tenantId = await requireTenantId();

  try {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!order) return { success: false, error: "Pedido no encontrado" };

    const advanceStatus = order.status === "pending" ? ("preparing" as const) : undefined;

    await db
      .update(orders)
      .set({
        paymentStatus: "paid",
        updatedAt: new Date(),
        ...(advanceStatus ? { status: advanceStatus } : {}),
      })
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

    revalidatePath("/admin");
    return { success: true };
  } catch {
    return { success: false, error: "Error al marcar como pagado" };
  }
}
