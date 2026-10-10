import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { channels, products, tenants } from "@/db/schema";
import { setCredential } from "@/lib/credentials";
import type { CatalogRow } from "./catalog";

// ─── Onboarding data access (no auth) ────────────────────────────────────────
//
// Deliberately does NOT import `@/lib/tenants` — that module pulls NextAuth
// (`@/auth`) into the standalone tsx process. These helpers re-implement the
// two behaviours the CLI needs, with the same tenant-scoping guarantees:
// default-tenant resolution and idempotent channel registration.

/**
 * Resolves the bootstrap tenant: `DEFAULT_TENANT_SLUG` first, else the first
 * tenant in the table. Mirrors `getDefaultTenantId` without the auth import.
 */
export async function resolveDefaultTenantId(): Promise<number | null> {
  const slug = process.env.DEFAULT_TENANT_SLUG;
  if (slug) {
    const [bySlug] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (bySlug) return bySlug.id;
  }
  const [first] = await db.select({ id: tenants.id }).from(tenants).limit(1);
  return first?.id ?? null;
}

/** Registers a YCloud channel row if absent (idempotent via unique index). */
export async function ensureYCloudChannel(input: {
  tenantId: number;
  phoneNumber: string;
}): Promise<void> {
  await db
    .insert(channels)
    .values({
      tenantId: input.tenantId,
      provider: "ycloud",
      externalId: input.phoneNumber,
      displayName: input.phoneNumber,
      config: {},
      isActive: true,
    })
    .onConflictDoNothing();
}

export interface ImportCatalogResult {
  inserted: number;
  skipped: number;
}

/**
 * Imports catalog rows scoped to `tenantId`. Idempotent by product name within
 * the tenant: an existing name is skipped, never overwritten. Every write
 * carries `tenant_id` (isolation law).
 */
export async function importCatalog(
  tenantId: number,
  rows: CatalogRow[],
): Promise<ImportCatalogResult> {
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.name, row.name)))
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(products).values({
      tenantId,
      name: row.name,
      description: row.description,
      price: row.price,
      promoPrice: row.promoPrice,
      isPromo: row.isPromo,
      imageUrl: row.imageUrl,
      category: row.category,
      line: row.line,
      available: row.available,
      stock: row.stock,
      sortOrder: row.sortOrder,
      variants: [],
    });
    inserted += 1;
  }

  return { inserted, skipped };
}

/**
 * Stores a provider's credentials encrypted at rest. Returns the key NAMES
 * written (never the values); empty values are skipped.
 */
export async function storeProviderCredentials(input: {
  tenantId: number;
  provider: string;
  credentials: Record<string, string>;
}): Promise<string[]> {
  const written: string[] = [];
  for (const [key, value] of Object.entries(input.credentials)) {
    if (!value) continue;
    await setCredential({
      tenantId: input.tenantId,
      provider: input.provider,
      key,
      value,
    });
    written.push(key);
  }
  return written;
}
