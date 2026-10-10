import { randomUUID } from "crypto";

// ─── Web-order reference ─────────────────────────────────────────────────────
//
// A structured order captured on the public storefront hands the customer a
// `WEB:<uuid>` token. When that token arrives back over a chat channel, the
// deterministic layer recognizes it and routes the turn to a *confirm the
// structured order* capability — the model reads the order, it never has to
// reconstruct it from free text.

export const WEB_ORDER_REFERENCE_PREFIX = "WEB:";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const REFERENCE_IN_TEXT = new RegExp(`WEB:(${UUID})`);
const BARE_UUID = new RegExp(UUID);

/** Builds a fresh, globally-unique web-order reference. */
export function buildWebOrderReference(): string {
  return `${WEB_ORDER_REFERENCE_PREFIX}${randomUUID()}`;
}

/**
 * Extracts a `WEB:<uuid>` reference from a message. Accepts the prefixed form
 * (`WEB:...`) or a bare uuid, so links that URL-encode the colon still work.
 * Returns the canonical `WEB:<uuid>` token, or null.
 */
export function extractWebOrderReference(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const prefixed = text.match(REFERENCE_IN_TEXT);
  if (prefixed?.[1]) return `${WEB_ORDER_REFERENCE_PREFIX}${prefixed[1]}`;
  const bare = text.match(BARE_UUID);
  if (bare?.[0]) return `${WEB_ORDER_REFERENCE_PREFIX}${bare[0]}`;
  return null;
}
