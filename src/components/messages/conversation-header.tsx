"use client";

import { motion } from "framer-motion";
import { ArrowLeft, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import type { ConversationSummary } from "@/types/chat";

interface ConversationHeaderProps {
  conversation: ConversationSummary;
  humanOverrideActive: boolean;
  onBack?: () => void;
  onShowContext?: () => void;
  onHumanOverride?: () => void;
}

export function ConversationHeader({
  conversation,
  humanOverrideActive,
  onBack,
  onShowContext,
  onHumanOverride,
}: ConversationHeaderProps) {
  const displayName =
    conversation.customerName || conversation.customerPhone || "Desconocido";
  const initial = (
    conversation.customerName?.[0] ||
    conversation.customerPhone?.slice(-2) ||
    "?"
  ).toUpperCase();

  const badgeMode = humanOverrideActive
    ? "human"
    : conversation.status === "active"
      ? "ai"
      : "stale";

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[rgba(0,0,0,0.6)] backdrop-blur-lg"
    >
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-lg hover:bg-white/5 text-neutral-400 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-neutral-300">
        {initial}
      </div>

      {/* Info */}
      <button
        onClick={onShowContext}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-100 truncate">
            {displayName}
          </span>
          {conversation.status === "active" && !humanOverrideActive && (
            <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-neutral-500 truncate">
          {conversation.customerPhone}
        </p>
      </button>

      {/* Status badge */}
      <StatusBadge mode={badgeMode} />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onShowContext && (
          <button
            onClick={onShowContext}
            className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 transition-colors lg:hidden"
            title="Datos del cliente"
          >
            <UserRound className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
