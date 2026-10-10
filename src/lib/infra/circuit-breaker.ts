// ─── Tiny circuit breaker ────────────────────────────────────────────────────
//
// Trips open after `threshold` consecutive failures; half-opens after
// `resetMs`. Used around external calls (WhatsApp send, LLM) so a broken
// upstream doesn't burn retries on every inbound message.

interface BreakerState {
  failures: number;
  openedAt: number;
}

const states = new Map<string, BreakerState>();

export interface CircuitBreakerOptions {
  threshold?: number;
  resetMs?: number;
}

export function isCircuitOpen(name: string, opts: CircuitBreakerOptions = {}): boolean {
  const { threshold = 5, resetMs = 60_000 } = opts;
  const s = states.get(name);
  if (!s) return false;
  if (s.failures < threshold) return false;
  // Half-open: allow one probe after resetMs.
  if (Date.now() - s.openedAt > resetMs) {
    s.failures = threshold - 1;
    return false;
  }
  return true;
}

export function recordSuccess(name: string): void {
  states.delete(name);
}

export function recordFailure(name: string, opts: CircuitBreakerOptions = {}): void {
  const { threshold = 5 } = opts;
  const s = states.get(name) ?? { failures: 0, openedAt: 0 };
  s.failures += 1;
  if (s.failures >= threshold) s.openedAt = Date.now();
  states.set(name, s);
}

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  opts: CircuitBreakerOptions = {},
): Promise<T> {
  if (isCircuitOpen(name, opts)) {
    throw new Error(`Circuit "${name}" is open`);
  }
  try {
    const result = await fn();
    recordSuccess(name);
    return result;
  } catch (error) {
    recordFailure(name, opts);
    throw error;
  }
}
