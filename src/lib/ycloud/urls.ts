import { normalizePhone } from "./phone";

/**
 * Build a WhatsApp deep link (wa.me) URL.
 * Internally normalizes the phone number.
 * If refCode is provided, it is appended to the message before encoding.
 */
export function buildWhatsAppUrl(
  phone: string,
  message: string,
  refCode?: string
): string {
  const normalized = normalizePhone(phone);
  const fullMessage = refCode ? `${message}\n${refCode}` : message;
  const encoded = encodeURIComponent(fullMessage);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/**
 * Truncate text to a maximum length, appending "..." if truncated.
 * Default max length is 100 characters.
 */
export function truncatePreview(
  text: string,
  maxLength: number = 100
): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}
