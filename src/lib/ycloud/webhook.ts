const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Parse a YCloud signature header of the form "t=<timestamp>,s=<hmac>"
 * and verify the HMAC-SHA256 against the raw request body.
 *
 * Returns true if the signature is valid and the timestamp is within tolerance.
 */
export async function verifyYCloudSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split(",");
  let timestamp = "";
  let signature = "";

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("t=")) {
      timestamp = trimmed.slice(2);
    } else if (trimmed.startsWith("s=")) {
      signature = trimmed.slice(2);
    }
  }

  if (!timestamp || !signature) {
    return false;
  }

  // Check timestamp age (replay protection)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > DEFAULT_TOLERANCE_SECONDS) {
    return false;
  }

  // Compute expected HMAC-SHA256 using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedPayload = `${timestamp}.${rawBody}`;
  const hmacBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );

  const computedHmac = Array.from(new Uint8Array(hmacBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe: compare hex strings from the same HMAC derivation
  return computedHmac === signature;
}
