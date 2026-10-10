// ─── In-memory idempotency (best effort, 5 min TTL) ─────────────────────────
// For durable dedup prefer the DB unique index on platform_message_id — this
// layer only shields hot paths (webhook retries inside the same process).

const cache = new Map<string, number>();
const TTL = 5 * 60 * 1000;

export function checkIdempotency(key: string): boolean {
  const ts = cache.get(key);
  if (!ts) return false;
  if (Date.now() - ts > TTL) {
    cache.delete(key);
    return false;
  }
  return true;
}

export function setIdempotency(key: string): void {
  cache.set(key, Date.now());
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, ts] of cache) {
      if (now - ts > TTL) cache.delete(k);
    }
  }
}

export function createIdempotencyKey(...parts: (string | number)[]): string {
  return parts.join("-");
}
