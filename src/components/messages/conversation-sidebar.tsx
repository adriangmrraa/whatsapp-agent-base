"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import type { ConversationSummary } from "@/types/chat";

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  className?: string;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function ConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  onClick: (id: number) => void;
}) {
  const displayName =
    conversation.customerName || conversation.customerPhone || "Desconocido";
  const initial = (
    conversation.customerName?.[0] ||
    conversation.customerPhone?.slice(-2) ||
    "?"
  ).toUpperCase();

  const isHumanOverride = conversation.humanOverrideUntil
    ? new Date(conversation.humanOverrideUntil) > new Date()
    : false;

  const badgeMode = isHumanOverride
    ? "human"
    : conversation.status === "active"
      ? "ai"
      : "stale";

  return (
    <motion.button
      layout
      onClick={() => onClick(conversation.id)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
        "hover:bg-white/[0.03]",
        isActive
          ? "border-l-2 border-white/30 bg-white/[0.05]"
          : "border-l-2 border-transparent",
      )}
      whileTap={{ scale: 0.98 }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-neutral-300">
          {initial}
        </div>
        {conversation.status === "active" && !isHumanOverride && (
          <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0f0f0f]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-neutral-100 truncate">
            {displayName}
          </span>
          <span className="text-[10px] text-neutral-500 flex-shrink-0">
            {formatRelativeTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-neutral-400 truncate flex-1">
            {truncate(conversation.lastMessagePreview, 60)}
          </p>
          {isHumanOverride && (
            <span className="text-[10px] text-amber-400 font-medium flex-shrink-0">
              Manual
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  className,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.customerName?.toLowerCase().includes(q) ||
        c.customerPhone?.toLowerCase().includes(q) ||
        c.lastMessagePreview?.toLowerCase().includes(q);

      const matchesFilter = !showActiveOnly || c.status === "active";

      return matchesSearch && matchesFilter;
    });
  }, [conversations, search, showActiveOnly]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#0f0f0f]",
        className,
      )}
    >
      {/* Header with search */}
      <div className="p-4 space-y-3 border-b border-white/5">
        <h2 className="text-lg font-semibold text-neutral-100">
          Conversaciones
        </h2>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>

        {/* Filter toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowActiveOnly(!showActiveOnly)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              showActiveOnly
                ? "bg-white/10 text-neutral-200"
                : "text-neutral-400 hover:text-neutral-200",
            )}
          >
            Solo activas
          </button>
          <span className="text-[11px] text-neutral-500">
            {filtered.length} conversación
            {filtered.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {filtered.length > 0 ? (
            filtered.map((conversation, i) => (
              <motion.div
                key={conversation.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, delay: i * 0.02 }}
              >
                <ConversationItem
                  conversation={conversation}
                  isActive={conversation.id === activeId}
                  onClick={onSelect}
                />
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 gap-2"
            >
              <MessageSquare className="h-8 w-8 text-neutral-600" />
              <p className="text-sm text-neutral-500">
                {search
                  ? "No se encontraron conversaciones"
                  : "No hay conversaciones"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
