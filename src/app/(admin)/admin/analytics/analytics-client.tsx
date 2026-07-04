"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCartIcon,
  DollarSignIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { staggerContainer, cardEntrance, fadeUpSmall } from "@/lib/animations";
import type { DaySeries, RevenueStats, LeadConversionStats, TopProduct } from "./actions";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AnalyticsClientProps {
  days: 7 | 30;
  timeSeries: DaySeries[];
  revenueStats: RevenueStats;
  leadConversion: LeadConversionStats;
  topProducts: TopProduct[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ─── Date Range Toggle ─────────────────────────────────────────────────────────

function DateRangeToggle({ current }: { current: 7 | 30 }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setDays = useCallback(
    (days: 7 | 30) => {
      const params = new URLSearchParams(searchParams.toString());
      if (days === 7) {
        params.delete("days");
      } else {
        params.set("days", String(days));
      }
      const qs = params.toString();
      router.push(qs ? `/admin/analytics?${qs}` : "/admin/analytics");
    },
    [router, searchParams],
  );

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-lg"
      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
    >
      <button
        type="button"
        onClick={() => setDays(7)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
          current === 7
            ? "bg-white/10 text-white/90"
            : "text-white/40 hover:text-white/70"
        }`}
      >
        7 days
      </button>
      <button
        type="button"
        onClick={() => setDays(30)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
          current === 30
            ? "bg-white/10 text-white/90"
            : "text-white/40 hover:text-white/70"
        }`}
      >
        30 days
      </button>
    </div>
  );
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
  return (
    <motion.div
      variants={cardEntrance}
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {title}
        </span>
        <div
          className="size-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <div
          className="text-3xl font-bold"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {value}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Time Series Table ─────────────────────────────────────────────────────────

function TimeSeriesTable({ data }: { data: DaySeries[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      <div
        className="px-6 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          Orders Over Time
        </h2>
      </div>

      {data.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            No orders in this period.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <th
                className="text-left px-6 py-3 font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Date
              </th>
              <th
                className="text-right px-6 py-3 font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Orders
              </th>
              <th
                className="text-right px-6 py-3 font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.date}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td
                  className="px-6 py-3"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {formatDate(row.date)}
                </td>
                <td
                  className="px-6 py-3 text-right"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {row.count}
                </td>
                <td
                  className="px-6 py-3 text-right font-mono text-xs"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {formatCurrency(row.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Top Products Table ────────────────────────────────────────────────────────

function TopProductsTable({ data }: { data: TopProduct[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      <div
        className="px-6 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          Top Products
        </h2>
      </div>

      {data.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            No products ordered yet.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <th
                className="text-left px-6 py-3 font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Product
              </th>
              <th
                className="text-right px-6 py-3 font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Units Sold
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.name}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <td
                  className="px-6 py-3"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {row.name}
                </td>
                <td
                  className="px-6 py-3 text-right"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Analytics Client ──────────────────────────────────────────────────────────

export function AnalyticsClient({
  days,
  timeSeries,
  revenueStats,
  leadConversion,
  topProducts,
}: AnalyticsClientProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div
        variants={fadeUpSmall}
        initial="hidden"
        animate="visible"
        className="flex items-center justify-between gap-4 flex-wrap"
      >
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            Business metrics and revenue overview
          </p>
        </div>
        <DateRangeToggle current={days} />
      </motion.div>

      {/* Metric Cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <MetricCard
          title="Total Orders"
          value={String(revenueStats.totalOrders)}
          subtitle="All orders placed"
          icon={
            <ShoppingCartIcon
              className="size-4"
              style={{ color: "rgba(255,255,255,0.6)" }}
            />
          }
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(revenueStats.totalRevenue)}
          subtitle="Paid orders only"
          icon={
            <DollarSignIcon
              className="size-4"
              style={{ color: "rgba(255,255,255,0.6)" }}
            />
          }
        />
        <MetricCard
          title="Avg Order Value"
          value={formatCurrency(revenueStats.avgOrderValue)}
          subtitle="Revenue / Orders"
          icon={
            <TrendingUpIcon
              className="size-4"
              style={{ color: "rgba(255,255,255,0.6)" }}
            />
          }
        />
        <MetricCard
          title="Lead Conversion"
          value={`${leadConversion.rate}%`}
          subtitle={`${leadConversion.converted} / ${leadConversion.total} leads`}
          icon={
            <UsersIcon
              className="size-4"
              style={{ color: "rgba(255,255,255,0.6)" }}
            />
          }
        />
      </motion.div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          variants={cardEntrance}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <TimeSeriesTable data={timeSeries} />
        </motion.div>
        <motion.div
          variants={cardEntrance}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
          <TopProductsTable data={topProducts} />
        </motion.div>
      </div>
    </div>
  );
}
