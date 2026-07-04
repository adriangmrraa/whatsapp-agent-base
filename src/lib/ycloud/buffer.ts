type FlushHandler = (phone: string, combinedText: string) => Promise<void>;

interface BufferEntry {
  texts: string[];
  timer: NodeJS.Timeout | null;
  handler: FlushHandler;
}

const DEBOUNCE_MS = 800;

const buffers = new Map<string, BufferEntry>();

function flushEntry(phone: string, entry: BufferEntry): Promise<void> {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  if (entry.texts.length === 0) return Promise.resolve();

  const combined = entry.texts.join("\n");
  entry.texts = [];

  return entry.handler(phone, combined).catch(() => {
    // Handler errors are intentionally swallowed — the caller
    // is responsible for its own error handling.
  });
}

/**
 * Add text to a per-phone buffer.
 * After 800ms of inactivity, the buffer is flushed: all texts are joined
 * with newlines and passed to the handler. The timer resets on each call.
 */
export function addToBuffer(
  phone: string,
  text: string,
  flushHandler: FlushHandler
): void {
  let entry = buffers.get(phone);

  if (!entry) {
    entry = { texts: [], timer: null, handler: flushHandler };
    buffers.set(phone, entry);
  }

  // Update handler reference (in case it changes between calls)
  entry.handler = flushHandler;

  // Clear existing timer
  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  entry.texts.push(text);

  entry.timer = setTimeout(() => {
    const current = buffers.get(phone);
    if (!current) return;
    flushEntry(phone, current);
  }, DEBOUNCE_MS);
}

/**
 * Flush all pending buffers immediately.
 * Returns a promise that resolves when all flush handlers have completed
 * (regardless of individual handler failures).
 */
export async function flushAll(): Promise<void> {
  const pending: Promise<void>[] = [];

  for (const [phone, entry] of buffers) {
    pending.push(flushEntry(phone, entry));
  }

  await Promise.allSettled(pending);
}
