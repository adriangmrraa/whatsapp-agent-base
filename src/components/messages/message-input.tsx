"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  isSending = false,
  placeholder = "Escribí un mensaje...",
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, isSending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const canSend = value.trim().length > 0 && !disabled && !isSending;

  return (
    <div className="px-4 py-3 border-t border-white/5 bg-[rgba(0,0,0,0.4)] backdrop-blur-lg">
      {isSending && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-[11px] text-neutral-500 mb-2"
        >
          Enviando...
        </motion.p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl px-4 py-2.5 text-sm text-neutral-200",
            "bg-white/5 border border-white/10 placeholder:text-neutral-500",
            "focus:outline-none focus:border-white/20 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "max-h-[120px]",
          )}
        />

        <motion.button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "flex-shrink-0 p-2.5 rounded-xl transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-white/5 text-neutral-600 cursor-not-allowed",
          )}
          whileTap={canSend ? { scale: 0.92 } : undefined}
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}
