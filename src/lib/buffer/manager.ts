import { redis } from "./redis";
import { bufferConfigFor } from "./config";

// ─── Debounce buffer (Redis + in-memory fallback) ────────────────────────────
//
// Messages arriving in bursts ("hola", "quiero", "2 hamburguesas") get merged
// into a single agent turn. Redis storage makes enqueues multi-instance safe;
// the flush itself runs in the process that won the flush lock. On serverless
// platforms without a persistent process, pair this with the cron flush
// endpoint (POST /api/cron/flush) as a safety net for stranded buffers.

export interface BufferedMessage {
  content: string;
  messageId: string;
  timestamp: number;
  contentAttributes?: unknown[];
}

export type FlushHandler = (messages: BufferedMessage[]) => Promise<void>;

const flushHandlers = new Map<string, FlushHandler>();
const localTimers = new Map<string, NodeJS.Timeout>();

function bufferKey(scope: string, userId: string) {
  return `buffer:${scope}:${userId}`;
}
function timerKey(scope: string, userId: string) {
  return `timer:${scope}:${userId}`;
}
function lockKey(scope: string, userId: string) {
  return `lock:${scope}:${userId}`;
}
function handlerKey(scope: string, userId: string) {
  return `${scope}:${userId}`;
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

interface InMemoryEntry {
  messages: BufferedMessage[];
  timer: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();
const ENTRY_TTL = 10 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - ENTRY_TTL;
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.timer < cutoff) inMemoryStore.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export const BufferManager = {
  async enqueue(
    scope: string,
    userId: string,
    message: BufferedMessage,
    onFlush: FlushHandler,
  ): Promise<void> {
    const config = bufferConfigFor(scope);
    flushHandlers.set(handlerKey(scope, userId), onFlush);

    if (redis) {
      const bKey = bufferKey(scope, userId);
      const tKey = timerKey(scope, userId);
      await redis.rpush(bKey, JSON.stringify(message));
      await redis.expire(bKey, 600);
      // Refresh the debounce timer — last writer wins.
      await redis.set(tKey, Date.now().toString(), { ex: Math.ceil(config.debounceMs / 1000) + 2 });
    } else {
      const key = bufferKey(scope, userId);
      const entry = inMemoryStore.get(key) ?? { messages: [], timer: 0 };
      entry.messages.push(message);
      entry.timer = Date.now();
      inMemoryStore.set(key, entry);
    }

    // Local timer drives the actual flush in this process.
    const hKey = handlerKey(scope, userId);
    const prev = localTimers.get(hKey);
    if (prev) clearTimeout(prev);
    localTimers.set(
      hKey,
      setTimeout(() => {
        void BufferManager.flush(scope, userId);
      }, config.debounceMs),
    );
  },

  async acquireLock(scope: string, userId: string, ttlSec = 30): Promise<boolean> {
    if (redis) {
      const res = await redis.set(lockKey(scope, userId), "1", { nx: true, ex: ttlSec });
      return res === "OK";
    }
    // Single-process: a Set marker is enough.
    if (localLockSet.has(handlerKey(scope, userId))) return false;
    localLockSet.add(handlerKey(scope, userId));
    return true;
  },

  async releaseLock(scope: string, userId: string): Promise<void> {
    if (redis) await redis.del(lockKey(scope, userId));
    localLockSet.delete(handlerKey(scope, userId));
  },

  /** Drain the buffer for (scope, userId) and invoke the flush handler once. */
  async flush(scope: string, userId: string): Promise<void> {
    const handler = flushHandlers.get(handlerKey(scope, userId));
    localTimers.delete(handlerKey(scope, userId));
    if (!handler) return;

    const locked = await this.acquireLock(scope, userId);
    if (!locked) return; // another instance is flushing

    try {
      const messages = await this.drain(scope, userId);
      if (messages.length === 0) return;
      await handler(messages);
    } finally {
      await this.releaseLock(scope, userId);
    }
  },

  async drain(scope: string, userId: string): Promise<BufferedMessage[]> {
    if (redis) {
      const bKey = bufferKey(scope, userId);
      const items = await redis.lrange(bKey, 0, -1);
      await redis.del(bKey);
      return items
        .map((item) => {
          try {
            return typeof item === "string" ? (JSON.parse(item) as BufferedMessage) : (item as BufferedMessage);
          } catch {
            return null;
          }
        })
        .filter((m): m is BufferedMessage => !!m);
    }
    const key = bufferKey(scope, userId);
    const entry = inMemoryStore.get(key);
    inMemoryStore.delete(key);
    return entry?.messages ?? [];
  },

  /** Flushes every buffer whose debounce timer expired (cron sweep). */
  async flushExpired(): Promise<number> {
    if (!redis) return 0;
    let flushed = 0;
    let cursor = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: "timer:*", count: 100 });
      cursor = Number(next);
      for (const tKey of keys) {
        // Timer key present = still within debounce window; expired keys are
        // gone automatically. A buffer key whose timer key vanished is stranded.
        const parts = tKey.split(":");
        // timer:{scope}:{userId}
        const scope = parts.slice(1, -1).join(":");
        const userId = parts[parts.length - 1];
        const bKey = bufferKey(scope, userId);
        const stillWaiting = await redis.exists(tKey);
        const hasItems = (await redis.llen(bKey)) > 0;
        if (!stillWaiting && hasItems) {
          await this.flush(scope, userId);
          flushed++;
        }
      }
    } while (cursor !== 0);
    return flushed;
  },
};

const localLockSet = new Set<string>();
