import { redis } from "@/lib/buffer/redis";
import logger from "@/lib/logger";

// ─── Outbound message queue (Upstash) ────────────────────────────────────────
// Provider sends can be enqueued for retry with exponential backoff instead
// of blocking the webhook path. A DLQ captures payloads that exhaust retries.

export const QUEUE_KEY = "queue:outbound";
export const DLQ_KEY = "queue:outbound:dlq";

export interface QueuePayload {
  tenantId: number;
  conversationId: number;
  provider: string;
  to: string;
  kind: "text" | "image" | "document" | "video" | "audio";
  text?: string;
  url?: string;
  caption?: string;
  fileName?: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export async function enqueueOutbound(
  payload: Omit<QueuePayload, "timestamp" | "retryCount">,
): Promise<boolean> {
  if (!redis) return false; // caller falls back to direct send
  try {
    await redis.rpush(QUEUE_KEY, JSON.stringify({ ...payload, timestamp: Date.now(), retryCount: 0 }));
    return true;
  } catch (error) {
    logger.error({ error }, "[queue] enqueue failed");
    return false;
  }
}

export async function pushToDlq(payload: QueuePayload): Promise<void> {
  if (!redis) return;
  try {
    await redis.rpush(DLQ_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.error({ error }, "[queue] dlq push failed");
  }
}
