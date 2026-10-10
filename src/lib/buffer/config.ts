import type { ChannelProvider } from "@/lib/providers/types";

export interface BufferChannelConfig {
  debounceMs: number;
  maxMessages: number;
}

export const BUFFER_CONFIG: Record<string, BufferChannelConfig> & {
  default: BufferChannelConfig;
} = {
  whatsapp: { debounceMs: 4000, maxMessages: 20 },
  telegram: { debounceMs: 2500, maxMessages: 20 },
  chatwoot: { debounceMs: 1500, maxMessages: 20 },
  meta: { debounceMs: 4000, maxMessages: 20 },
  ycloud: { debounceMs: 4000, maxMessages: 20 },
  default: { debounceMs: 3000, maxMessages: 20 },
};

export type BufferKey = ChannelProvider | "whatsapp" | "default";

export function bufferConfigFor(key: string): BufferChannelConfig {
  return BUFFER_CONFIG[key] ?? BUFFER_CONFIG.default;
}
