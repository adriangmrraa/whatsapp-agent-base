import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES block size in bytes

/**
 * Derive a 256-bit (32-byte) key from the ENCRYPTION_KEY env var.
 * The raw value can be any string — it is hashed via SHA-256 to produce
 * a deterministic 32-byte key suitable for AES-256-CBC.
 */
function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * The IV is randomly generated, prepended to the ciphertext, and both are
 * returned as a single hex-encoded string.
 *
 * @returns Hex-encoded string: iv + ciphertext
 */
export function encrypt(text: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Prepend IV so decrypt() can extract it
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt a string previously produced by encrypt().
 *
 * @param encryptedText - Hex-encoded string in the format "iv:ciphertext"
 * @returns The original plaintext, or null if decryption fails (wrong key,
 *          tampered data, or invalid format).
 */
export function decrypt(encryptedText: string): string | null {
  try {
    const key = deriveKey();
    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
      return null;
    }

    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    // Decryption can fail due to bad key, corrupted data, or invalid IV
    return null;
  }
}
