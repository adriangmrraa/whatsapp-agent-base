"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ShoppingCartIcon,
  DollarSignIcon,
  UserPlusIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  MessageSquareIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { staggerContainer, cardEntrance, fadeUpSmall } from "@/lib/animations";
import type { DashboardCard } from "./page";
import type { ActivityItem, ActionCard, ActionCardItem } from "./dashboard-actions";

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<DashboardCard["iconName"], typeof ShoppingCartIcon> = {
  cart: ShoppingCartIcon,
  dollar: DollarSignIcon,
  userplus: UserPlusIcon,
  trending: TrendingUpIcon,
};

// ─── Action card icon map ────────────────────────────────────────────────────

const ACTION_ICON_MAP: Record<string, typeof CheckCircleIcon> = {
  "check-circle": CheckCircleIcon,
  clock: ClockIcon,
  "dollar-sign": DollarSignIcon,
  "message-square": MessageSquareIcon,
  "user-plus": UserPlusIcon,
};

// ─── Color styles for action cards ─────────────────────────────────────────

const CARD_STYLES: Record<string, { border: string; bg: string; btn: string; btnHover: string }> = {
  red: {
    border: "border-red-500/20",
    bg: "bg-red-500/[0.03]",
    btn: "bg-red-500/15 text-red-300 border border-red-500/20",
    btnHover: "hover:bg-red-500/25",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.03]",
    btn: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
    btnHover: "hover:bg-amber-500/25",
  },
  blue: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/[0.03]",
    btn: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
    btnHover: "hover:bg-blue-500/25",
  },
  green: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.03]",
    btn: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
    btnHover: "hover:bg-emerald-500/25",
  },
};

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({ card, index }: { card: DashboardCard; index: number }) {
  const Icon = ICON_MAP[card.iconName];

  return (
    <motion.div
      variants={cardEntrance}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.08 }}
      whileHover={{
        y: -2,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        transition: { duration: 0.2 },
      }}
      className="rounded-xl p-5 flex flex-col gap-3 cursor-default"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
          {card.title}
        </span>
        <div
          className="size-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Icon className="size-4" style={{ color: "rgba(255,255,255,0.6)" }} />
        </div>
      </div>

      <div>
        <motion.div
          className="text-3xl font-bold"
          style={{ color: "rgba(255,255,255,0.9)" }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          {card.value}
        </motion.div>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          {card.description}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <motion.li
      variants={fadeUpSmall}
      className="flex items-center justify-between gap-3 px-6 py-3"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 border-0 ${
            item.type === "lead"
              ? "bg-blue-500/15 text-blue-400"
              : "bg-orange-500/15 text-orange-400"
          }`}
        >
          {item.type === "lead" ? "Lead" : "Pedido"}
        </span>
        <div className="min-w-0">
          {item.name ? (
            <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
              {item.name}
            </p>
          ) : null}
          <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {item.phone}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
        {item.timeLabel}
      </span>
    </motion.li>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────

const ACTION_HREF: Record<string, (item: ActionCardItem) => string> = {
  "mark-delivered": () => "/admin/orders",
  "mark-ready": () => "/admin/orders",
  "mark-paid": () => "/admin/orders",
  "open-chat": (item) => item.conversationId ? `/admin/conversations/${item.conversationId}` : "/admin/conversations",
  "view-lead": () => "/admin/conversations",
};

function ActionCardComponent({ card }: { card: ActionCard }) {
  const styles = CARD_STYLES[card.color] ?? CARD_STYLES.red;
  const Icon = ACTION_ICON_MAP[card.icon] || AlertTriangleIcon;

  return (
    <motion.div
      variants={cardEntrance}
      className={`rounded-xl border ${styles.border} ${styles.bg} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <Icon className="size-4" />
          <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {card.title}
          </h3>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
          {card.items.length} pendiente{card.items.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Items */}
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        {card.items.map((item) => {
          return (
            <div
              key={item.id}
              className="px-4 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] font-medium truncate"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {item.label}
                </p>
                <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {item.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {card.actions.map((action) => {
                  const href = ACTION_HREF[action.action]?.(item);
                  return (
                    <Link
                      key={action.action}
                      href={href ?? "#"}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${styles.btn} ${styles.btnHover} flex items-center gap-1.5 no-underline`}
                    >
                      {action.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Dashboard Client ─────────────────────────────────────────────────────────

interface DashboardClientProps {
  cards: DashboardCard[];
  activity: ActivityItem[];
  actionCards: ActionCard[];
}

export function DashboardClient({ cards, activity, actionCards }: DashboardClientProps) {

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div variants={fadeUpSmall} initial="hidden" animate="visible">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
          Dashboard
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          Resumen general del negocio
        </p>
      </motion.div>

      {/* Stats grid — 4 cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {cards.map((card, idx) => (
          <StatsCard key={card.title} card={card} index={idx} />
        ))}
      </motion.div>

      {/* Activity + Action cards layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed — takes 1 column */}
        <motion.div
          className="rounded-xl overflow-hidden lg:col-span-1"
          variants={cardEntrance}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.35 }}
          style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
        >
          <div className="px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
              Actividad Reciente
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Últimos leads y pedidos
            </p>
          </div>

          <AnimatePresence mode="wait">
            {activity.length === 0 ? (
              <motion.p
                key="empty"
                variants={fadeUpSmall}
                initial="hidden"
                animate="visible"
                className="px-6 pb-6 text-sm"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                No hay actividad reciente.
              </motion.p>
            ) : (
              <motion.ul
                key="list"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {activity.map((item, idx) => (
                  <ActivityRow key={`${item.type}-${item.id}-${idx}`} item={item} />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Action Cards — takes 2 columns */}
        <div className="lg:col-span-2">
          {actionCards.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-4"
            >
              <motion.div variants={fadeUpSmall}>
                <h2 className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                  Acciones del d&iacute;a
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Insights y acciones r&aacute;pidas basadas en datos en vivo
                </p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {actionCards.map((card) => (
                  <ActionCardComponent key={card.id} card={card} />
                ))}
              </div>
            </motion.div>
          )}

          {actionCards.length === 0 && (
            <motion.div
              variants={fadeUpSmall}
              initial="hidden"
              animate="visible"
              className="flex items-center justify-center min-h-[200px] rounded-xl"
              style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                No hay accciones pendientes. Todo al d&iacute;a.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
