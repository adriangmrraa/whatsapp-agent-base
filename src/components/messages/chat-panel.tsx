"use client";

import { useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ConversationHeader } from "./conversation-header";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import type { ConversationSummary, Message } from "@/types/chat";

interface ChatPanelProps {
  conversation: ConversationSummary;
  messages: Message[];
  onSend: (message: string) => void;
  onBack?: () => void;
  onHumanOverride?: () => void;
  onShowContext?: () => void;
  humanOverrideActive?: boolean;
  isSending?: boolean;
  className?: string;
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(dateStr, today.toISOString())) return "Hoy";
  if (isSameDay(dateStr, yesterday.toISOString())) return "Ayer";
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-[11px] text-neutral-500 font-medium px-2">
        {formatDateSeparator(date)}
      </span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

export function ChatPanel({
  conversation,
  messages,
  onSend,
  onBack,
  onHumanOverride,
  onShowContext,
  humanOverrideActive,
  isSending,
  className,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-h-0 bg-[#0a0a0a]",
        className,
      )}
    >
      <ConversationHeader
        conversation={conversation}
        humanOverrideActive={humanOverrideActive ?? false}
        onBack={onBack}
        onShowContext={onShowContext}
        onHumanOverride={onHumanOverride}
      />

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="px-4 py-4 space-y-1">
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => {
              const showDate =
                i === 0 ||
                !isSameDay(messages[i - 1].createdAt, msg.createdAt);

              return (
                <div key={msg.id}>
                  {showDate && <DateSeparator date={msg.createdAt} />}
                  <div
                    className={cn(
                      "flex mb-2",
                      msg.role === "user" ? "justify-start" : "justify-end",
                      msg.role === "system" && "justify-center",
                    )}
                  >
                    <MessageBubble message={msg} />
                  </div>
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Input */}
      <MessageInput onSend={onSend} isSending={isSending ?? false} />
    </div>
  );
}
