"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  X,
  Check,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { fadeUpSmall, staggerContainer } from "@/lib/animations";
import {
  updateOrderStatusAction,
  markOrderPaymentAction,
  deleteOrderAction,
  type OrderRow,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Status Config ──────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  color: string;
  dot: string;
}

const STATUSES: Record<string, StatusConfig> = {
  pending: {
    label: "Pending",
    color: "text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
  preparing: {
    label: "Preparing",
    color: "text-blue-400 border-blue-500/30",
    dot: "bg-blue-400",
  },
  ready: {
    label: "Ready",
    color: "text-green-400 border-green-500/30",
    dot: "bg-green-400",
  },
  delivered: {
    label: "Delivered",
    color: "text-white/40 border-white/[0.08]",
    dot: "bg-white/20",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-red-400/60 border-red-500/20",
    dot: "bg-red-400/50",
  },
};

const NEXT_STATUS: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "delivered",
};

const ALL_STATUSES = ["", "pending", "preparing", "ready", "delivered", "cancelled"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "Now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 120) return "1 hour ago";

  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function orderTypeBadge(type: string | null): { label: string; cls: string } {
  if (type === "hamburguesas")
    return {
      label: "🍔 Hamburguesas",
      cls: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
    };
  if (type === "pan_mayorista")
    return {
      label: "🍞 Pan Mayorista",
      cls: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
    };
  return {
    label: type ?? "General",
    cls: "bg-white/[0.04] text-white/50 border border-white/[0.08]",
  };
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onAction,
}: {
  order: OrderRow;
  onAction: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusCfg = STATUSES[order.status] ?? STATUSES.pending;
  const typeBadge = orderTypeBadge(order.orderType);
  const items: Array<{ name?: string; quantity?: number; productName?: string }> =
    Array.isArray(order.items) ? order.items : [];

  const handleAction = useCallback(
    async (action: string, payload?: unknown) => {
      setChanging(true);
      try {
        switch (action) {
          case "next":
            const next = NEXT_STATUS[order.status];
            if (next) await updateOrderStatusAction(order.id, next as any);
            break;
          case "cancel":
            await updateOrderStatusAction(order.id, "cancelled");
            break;
          case "pay":
            await markOrderPaymentAction(order.id);
            break;
          case "delete":
            await deleteOrderAction(order.id);
            break;
        }
        onAction();
      } finally {
        setChanging(false);
        setConfirmDelete(false);
      }
    },
    [order.id, order.status, onAction],
  );

  const isActive = order.status !== "delivered" && order.status !== "cancelled";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-4 flex flex-col gap-3 transition-all duration-200"
      style={{
        backgroundColor: "#111111",
        borderColor:
          order.status === "pending"
            ? "rgba(212,160,23,0.25)"
            : order.status === "cancelled"
              ? "rgba(220,38,38,0.15)"
              : "rgba(255,255,255,0.06)",
      }}
    >
      {/* Header: #ID + Order Type + Payment */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-white/40">#{order.id}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full",
              typeBadge.cls,
            )}
          >
            {typeBadge.label}
          </span>
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              order.paymentStatus === "paid"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/20",
            )}
          >
            {order.paymentStatus === "paid" ? "Paid" : "Pending"}
          </span>
        </div>
      </div>

      {/* Customer */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-white/90">
          {order.customerName || "Unnamed"}
        </span>
        <div className="flex flex-col gap-0.5 text-xs text-white/40">
          <span>{order.phoneNumber}</span>
          {order.address && (
            <span className="truncate text-white/30">{order.address}</span>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="text-xs text-white/60 leading-relaxed">
        {items.length === 0 ? (
          <span className="italic text-white/30">No items</span>
        ) : (
          items.map((item, i) => (
            <span key={i} className="block">
              {item.quantity ?? 1}x {item.name ?? item.productName ?? "Product"}
            </span>
          ))
        )}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="text-[11px] text-white/40 italic border-t border-white/[0.04] pt-2 flex items-start gap-1.5">
          <AlertCircle className="size-3 shrink-0 mt-0.5 text-white/20" />
          <span>{order.notes}</span>
        </div>
      )}

      {/* Tags */}
      {Array.isArray(order.tags) && order.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {order.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer: Status + Time + Actions */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          <span
            className={cn("inline-flex h-2 w-2 rounded-full", statusCfg.dot)}
          />
          <span className={cn("text-[11px] font-medium", statusCfg.color)}>
            {statusCfg.label}
          </span>
          <span className="text-[10px] text-white/20">
            {formatTime(order.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Next status button */}
          {NEXT_STATUS[order.status] && (
            <Button
              type="button"
              size="sm"
              disabled={changing}
              onClick={() => handleAction("next")}
              className="h-7 text-xs px-2 bg-white/[0.06] hover:bg-white/[0.1] text-white/70"
            >
              <ArrowRight className="size-3 mr-1" />
              {STATUSES[NEXT_STATUS[order.status]]?.label}
            </Button>
          )}

          {/* Mark paid */}
          {isActive && order.paymentStatus !== "paid" && (
            <Button
              type="button"
              size="sm"
              disabled={changing}
              onClick={() => handleAction("pay")}
              className="h-7 text-xs px-2 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20"
            >
              <Check className="size-3 mr-1" /> Paid
            </Button>
          )}

          {/* Cancel (only for pending/preparing) */}
          {(order.status === "pending" || order.status === "preparing") && (
            <Button
              type="button"
              size="sm"
              disabled={changing}
              onClick={() => handleAction("cancel")}
              variant="ghost"
              className="h-7 w-7 p-0 text-red-400/50 hover:text-red-400"
              title="Cancel order"
            >
              <X className="size-3.5" />
            </Button>
          )}

          {/* Delete with inline confirm */}
          {confirmDelete ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                disabled={changing}
                onClick={() => handleAction("delete")}
                className="h-7 text-xs px-2 bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                {changing ? "..." : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                variant="ghost"
                className="h-7 w-7 p-0 text-white/30"
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              variant="ghost"
              className="h-7 w-7 p-0 text-white/20 hover:text-red-400"
              title="Delete order"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/20">
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

interface OrdersClientProps {
  orders: OrderRow[];
  totalPages: number;
  currentPage: number;
  currentStatus: string;
  currentPaymentStatus: string;
  currentQ: string;
  countsByStatus: Record<string, number>;
}

export function OrdersClient({
  orders,
  totalPages,
  currentPage,
  currentStatus,
  currentPaymentStatus,
  currentQ,
  countsByStatus,
}: OrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentQ);

  const navigate = useCallback(
    (params: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
      router.push(`/admin/orders?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const handleSearch = useCallback(() => {
    navigate({ q: search || undefined, page: undefined });
  }, [navigate, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch],
  );

  const onAction = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-5"
    >
      {/* Status Filter Tabs */}
      <motion.div variants={fadeUpSmall} className="flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => {
          const label = s === "" ? "All" : STATUSES[s]?.label ?? s;
          const active = s === currentStatus;
          const count = countsByStatus[s] ?? 0;

          return (
            <button
              key={s || "all"}
              type="button"
              onClick={() =>
                navigate({ status: s || undefined, page: undefined })
              }
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                active
                  ? "bg-white/[0.1] text-white border border-white/[0.15]"
                  : "text-white/40 hover:text-white/70 border border-transparent",
              )}
            >
              {label}{" "}
              <span
                className={active ? "text-white/50" : "text-white/20"}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        variants={fadeUpSmall}
        className="text-xs text-white/30 flex gap-3"
      >
        <span>
          {countsByStatus.pending ?? 0} pending
        </span>
        <span className="text-white/15">·</span>
        <span>
          {countsByStatus.preparing ?? 0} preparing
        </span>
        <span className="text-white/15">·</span>
        <span>
          {countsByStatus.ready ?? 0} ready
        </span>
        {(countsByStatus.delivered ?? 0) > 0 && (
          <>
            <span className="text-white/15">·</span>
            <span>
              {countsByStatus.delivered ?? 0} delivered
            </span>
          </>
        )}
        {(countsByStatus.cancelled ?? 0) > 0 && (
          <>
            <span className="text-white/15">·</span>
            <span>
              {countsByStatus.cancelled ?? 0} cancelled
            </span>
          </>
        )}
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUpSmall} className="flex gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30 pointer-events-none" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-xs pl-8 bg-white/[0.03] border-white/[0.08]"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleSearch}
          className="h-8 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-white/60"
        >
          Search
        </Button>
        {currentQ && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              navigate({ q: undefined, page: undefined });
            }}
            className="h-8 text-xs text-white/30"
          >
            Clear
          </Button>
        )}
      </motion.div>

      {/* Order Cards Grid */}
      <motion.div
        variants={fadeUpSmall}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {orders.length === 0 ? (
          <EmptyState
            label={
              currentStatus
                ? `No orders with status "${STATUSES[currentStatus]?.label ?? currentStatus}"`
                : currentQ
                  ? `No orders matching "${currentQ}"`
                  : "No orders yet."
            }
          />
        ) : (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} onAction={onAction} />
          ))
        )}
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          variants={fadeUpSmall}
          className="flex items-center justify-center gap-2 pt-2"
        >
          <Button
            type="button"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() =>
              navigate({ page: String(currentPage - 1) })
            }
            variant="outline"
            className="h-8 text-xs border-white/[0.08]"
          >
            <ChevronLeft className="size-3.5 mr-1" />
            Previous
          </Button>
          <span className="text-xs text-white/30">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() =>
              navigate({ page: String(currentPage + 1) })
            }
            variant="outline"
            className="h-8 text-xs border-white/[0.08]"
          >
            Next
            <ChevronRight className="size-3.5 ml-1" />
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
