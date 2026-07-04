const REF_PATTERN = /ref_([a-zA-Z0-9_-]+)/;

/**
 * Extract a ref code from a message string.
 * Looks for the pattern "ref_xxx" where xxx is alphanumeric plus underscore/hyphen.
 * Returns the full match (including "ref_" prefix) or null.
 */
export function parseRefCode(message: string): string | null {
  const match = message.match(REF_PATTERN);
  return match ? match[0] : null;
}

/**
 * Parse UTM parameters from a URL string.
 * Returns an object with utm_source, utm_medium, and/or utm_campaign if present.
 */
export function parseUtmParams(
  url: string
): { utm_source?: string; utm_campaign?: string; utm_medium?: string } {
  const params: { utm_source?: string; utm_campaign?: string; utm_medium?: string } = {};

  try {
    const parsed = new URL(url);
    const source = parsed.searchParams.get("utm_source");
    const medium = parsed.searchParams.get("utm_medium");
    const campaign = parsed.searchParams.get("utm_campaign");

    if (source) params.utm_source = source;
    if (medium) params.utm_medium = medium;
    if (campaign) params.utm_campaign = campaign;
  } catch {
    // Not a valid URL — return empty
  }

  return params;
}

/**
 * Append a ref code to the end of a message.
 * Adds a newline separator if the message doesn't end with one.
 */
export function appendRefToMessage(message: string, refCode: string): string {
  const separator = message.endsWith("\n") ? "" : "\n";
  return `${message}${separator}${refCode}`;
}
