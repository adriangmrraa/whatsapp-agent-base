import { redis } from "@/lib/buffer/redis";
import { getProvider, loadProviderCredentials } from "@/lib/providers/registry";
import type { ChannelProvider } from "@/lib/providers/types";
import { DLQ_KEY, QUEUE_KEY, pushToDlq, type QueuePayload } from "./producer";
import logger from "@/lib/logger";

const MAX_RETRIES = 5;

async function processOne(payload: QueuePayload): Promise<boolean> {
  const provider = getProvider(payload.provider as ChannelProvider);
  if (!provider) {
    logger.error({ provider: payload.provider }, "[queue] unknown provider");
    return false;
  }
  const credentials = await loadProviderCredentials(payload.tenantId, provider.provider);
  const result = await provider.send({
    credentials,
    channelExternalId: "", // resolved by conversation.channelId in router-level retries
    to: payload.to,
    payload:
      payload.kind === "text"
        ? { kind: "text", text: payload.text ?? " " }
        : { kind: payload.kind, url: payload.url ?? "", caption: payload.caption, fileName: payload.fileName },
  });
  return result.ok;
}

/** Pops one message, sends it, retries with backoff or DLQs after max. */
export async function processNextMessage(): Promise<boolean> {
  if (!redis) return false;
  const raw = await redis.lpop(QUEUE_KEY);
  if (!raw) return false;

  const payload = (typeof raw === "string" ? JSON.parse(raw) : raw) as QueuePayload;
  try {
    const ok = await processOne(payload);
    if (!ok) throw new Error(payload.lastError ?? "send failed");
    return true;
  } catch (error) {
    payload.retryCount += 1;
    payload.lastError = error instanceof Error ? error.message : String(error);
    if (payload.retryCount >= MAX_RETRIES) {
      await pushToDlq(payload);
      logger.error({ conversationId: payload.conversationId }, "[queue] message moved to DLQ");
    } else {
      // Exponential backoff: requeue at the tail — good enough for Upstash.
      await redis.rpush(QUEUE_KEY, JSON.stringify(payload));
    }
    return false;
  }
}

export async function drainQueue(limit = 50): Promise<number> {
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const did = await processNextMessage();
    if (!did && processed === i) break; // empty or poisoned
    processed++;
  }
  return processed;
}

export { DLQ_KEY };
