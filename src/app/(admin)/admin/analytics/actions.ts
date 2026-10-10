"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireTenantId } from "@/lib/tenants";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DaySeries {
  date: string;
  count: number;
  revenue: number;
}

export interface RevenueStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

export interface LeadConversionStats {
  total: number;
  converted: number;
  rate: number;
}

export interface TopProduct {
  name: string;
  count: number;
}

// ─── getOrdersTimeSeries ────────────────────────────────────────────────────────
// Daily order counts + revenue for the last N days, using raw SQL for date_trunc
// and jsonb_array_elements. Revenue = sum(item quantity * product price) +
// delivery fee for paid orders.

export async function getOrdersTimeSeries(days: 7 | 30 = 7): Promise<DaySeries[]> {
  const tenantId = await requireTenantId();
  const interval = `${days} days`;

  const result = await db.execute(sql`
    SELECT
      DATE_TRUNC('day', o.created_at)::text AS date,
      COUNT(*)::int AS count,
      COALESCE(SUM(
        COALESCE(
          (
            SELECT SUM(
              COALESCE((item->>'quantity')::numeric, 1) * COALESCE(p.price::numeric, 0)
            )
            FROM jsonb_array_elements(o.items) AS item
            LEFT JOIN products p ON p.name = item->>'productName' AND p.tenant_id = ${tenantId}
          ), 0
        ) + COALESCE(o.delivery_fee::numeric, 0)
      ), 0) AS revenue
    FROM orders o
    WHERE o.tenant_id = ${tenantId} AND o.created_at >= NOW() - ${interval}::interval
    GROUP BY DATE_TRUNC('day', o.created_at)
    ORDER BY date ASC
  `);

  const rows = (result as { rows: Record<string, unknown>[] }).rows ?? [];
  return rows.map((r) => ({
    date: String(r.date ?? ""),
    count: Number(r.count ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));
}

// ─── getRevenueStats ───────────────────────────────────────────────────────────
// Aggregate totals across all paid orders. Revenue includes per-item prices
// (looked up from products table) plus delivery fees.

export async function getRevenueStats(): Promise<RevenueStats> {
  const tenantId = await requireTenantId();
  const result = await db.execute(sql`
    WITH revenue_data AS (
      SELECT
        o.id,
        COALESCE(
          (
            SELECT SUM(
              COALESCE((item->>'quantity')::numeric, 1) * COALESCE(p.price::numeric, 0)
            )
            FROM jsonb_array_elements(o.items) AS item
            LEFT JOIN products p ON p.name = item->>'productName' AND p.tenant_id = ${tenantId}
          ), 0
        ) + COALESCE(o.delivery_fee::numeric, 0) AS revenue
      FROM orders o
      WHERE o.tenant_id = ${tenantId} AND o.payment_status = 'paid'
    )
    SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(revenue), 0) AS total_revenue,
      CASE WHEN COUNT(*) > 0 THEN SUM(revenue) / COUNT(*) ELSE 0 END AS avg_order_value
    FROM revenue_data
  `);

  const rows = (result as { rows: Record<string, unknown>[] }).rows ?? [];
  const row = rows[0] ?? {};
  return {
    totalOrders: Number(row.total_orders ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    avgOrderValue: Number(row.avg_order_value ?? 0),
  };
}

// ─── getLeadConversionStats ────────────────────────────────────────────────────

export async function getLeadConversionStats(): Promise<LeadConversionStats> {
  const tenantId = await requireTenantId();
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END), 0)::int AS converted
    FROM leads
    WHERE tenant_id = ${tenantId}
  `);

  const rows = (result as { rows: Record<string, unknown>[] }).rows ?? [];
  const row = rows[0] ?? {};
  const total = Number(row.total ?? 0);
  const converted = Number(row.converted ?? 0);

  return {
    total,
    converted,
    rate: total > 0 ? Math.round((converted / total) * 10000) / 100 : 0,
  };
}

// ─── getTopProducts ────────────────────────────────────────────────────────────
// Uses jsonb_array_elements to extract product names from every order's items
// array, aggregates by name, and returns the most frequently ordered products.

export async function getTopProducts(limit: number = 5): Promise<TopProduct[]> {
  const tenantId = await requireTenantId();
  const result = await db.execute(sql`
    SELECT
      item->>'productName' AS name,
      SUM(COALESCE((item->>'quantity')::int, 1))::int AS count
    FROM orders, jsonb_array_elements(items) AS item
    WHERE orders.tenant_id = ${tenantId}
    GROUP BY item->>'productName'
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  const rows = (result as { rows: Record<string, unknown>[] }).rows ?? [];
  return rows.map((r) => ({
    name: String(r.name ?? ""),
    count: Number(r.count ?? 0),
  }));
}
