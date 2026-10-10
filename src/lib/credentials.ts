import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { encrypt, decryptIfEncrypted } from "@/lib/encryption";
import logger from "@/lib/logger";

// ─── Per-tenant encrypted credential store ──────────────────────────────────
//
// Resolution order for every key:
//   1. credentials table row for (tenantId, provider, key) — AES-256 encrypted
//   2. env fallback (bootstrap path for single-tenant deployments)
//
// Nothing here logs values — only presence/absence.

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: string }>();

function cacheKey(tenantId: number, provider: string, key: string) {
  return `${tenantId}:${provider}:${key}`;
}

export function invalidateCredentialCache(
  tenantId?: number,
  provider?: string,
): void {
  if (tenantId === undefined) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(`${tenantId}:${provider ? `${provider}:` : ""}`)) {
      cache.delete(k);
    }
  }
}

/** Reads a credential for a tenant; falls back to `envFallback`. */
export async function getCredential(input: {
  tenantId: number;
  provider: string;
  key: string;
  envFallback?: string;
}): Promise<string> {
  const ck = cacheKey(input.tenantId, input.provider, input.key);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value = "";
  try {
    const [row] = await db
      .select({ valueEncrypted: credentials.valueEncrypted })
      .from(credentials)
      .where(
        and(
          eq(credentials.tenantId, input.tenantId),
          eq(credentials.provider, input.provider),
          eq(credentials.key, input.key),
        ),
      )
      .limit(1);
    if (row) value = decryptIfEncrypted(row.valueEncrypted);
  } catch (error) {
    logger.error(
      { error, tenantId: input.tenantId, provider: input.provider, key: input.key },
      "[credentials] read failed",
    );
  }

  if (!value && input.envFallback) value = input.envFallback;
  cache.set(ck, { at: Date.now(), value });
  return value;
}

/** Upserts an encrypted credential (AES-256 at rest). */
export async function setCredential(input: {
  tenantId: number;
  provider: string;
  key: string;
  value: string;
}): Promise<void> {
  const valueEncrypted = encrypt(input.value);
  await db
    .insert(credentials)
    .values({
      tenantId: input.tenantId,
      provider: input.provider,
      key: input.key,
      valueEncrypted,
    })
    .onConflictDoUpdate({
      target: [credentials.tenantId, credentials.provider, credentials.key],
      set: { valueEncrypted, updatedAt: new Date() },
    });
  cache.delete(cacheKey(input.tenantId, input.provider, input.key));
}

/** Deletes a credential (disconnect flows). */
export async function deleteCredential(input: {
  tenantId: number;
  provider: string;
  key: string;
}): Promise<void> {
  await db
    .delete(credentials)
    .where(
      and(
        eq(credentials.tenantId, input.tenantId),
        eq(credentials.provider, input.provider),
        eq(credentials.key, input.key),
      ),
    );
  cache.delete(cacheKey(input.tenantId, input.provider, input.key));
}

/** Presence check without decryption (safe for admin UI). */
export async function hasCredential(input: {
  tenantId: number;
  provider: string;
  key: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(
      and(
        eq(credentials.tenantId, input.tenantId),
        eq(credentials.provider, input.provider),
        eq(credentials.key, input.key),
      ),
    )
    .limit(1);
  return !!row;
}
