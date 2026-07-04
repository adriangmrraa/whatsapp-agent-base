"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const roleStyles: Record<string, string> = {
  user: "bg-white/5 border-white/10",
  assistant: "bg-primary/10 border-primary/20 ml-auto",
  human: "bg-blue-500/10 border-blue-500/20 ml-auto",
  system: "bg-neutral-800/50 border-white/5 mx-auto text-center",
};

const roleLabels: Record<string, string | null> = {
  user: null,
  assistant: "Bot",
  human: "Tú",
  system: null,
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const label = roleLabels[message.role];
  const isSystem = message.role === "system";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 border",
        roleStyles[message.role] || roleStyles.user,
      )}
    >
      {/* Role label */}
      {label && (
        <span className="block text-[10px] font-medium text-neutral-400 mb-1">
          {label}
        </span>
      )}

      {/* Media attachments */}
      {message.contentAttributes &&
        message.contentAttributes.length > 0 && (
          <div className="space-y-2 mb-2">
            {message.contentAttributes.map((media, i) => (
              <div key={i} className="rounded-lg overflow-hidden">
                {media.type === "image" && (
                  <img
                    src={media.url}
                    alt={media.caption ?? "Imagen"}
                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(media.url, "_blank")}
                  />
                )}
                {media.type === "document" && (
                  <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-neutral-300 hover:bg-white/10 transition-colors"
                  >
                    <span>📄</span>
                    <span className="truncate">
                      {media.fileName ?? "Documento"}
                    </span>
                  </a>
                )}
                {media.caption && (
                  <p className="text-xs text-neutral-400 mt-1">
                    {media.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

      {/* Text content */}
      {message.content && !isSystem && (
        <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">
          {message.content}
        </p>
      )}
      {isSystem && (
        <p className="text-xs text-neutral-500 italic">
          {message.content}
        </p>
      )}

      {/* Timestamp */}
      <div
        className={cn(
          "mt-1",
          isSystem
            ? "text-center"
            : message.role === "user"
              ? "text-left"
              : "text-right",
        )}
      >
        <span className="text-[10px] text-neutral-500">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </motion.div>
  );
}
