import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, products, agentConfig } from "@/db/schema";

// ─── Public storefront catalog ───────────────────────────────────────────────
//
// Public (unauthenticated) reads, resolved by tenant SLUG — never by a global
// singleton id. Every query is still tenant-scoped once the slug resolves. The
// storefront is generic: it renders whatever the tenant loaded into `products`
// plus their business-identity fields. No vertical logic lives here.

export interface PublicProduct {
  id: number;
  name: string;
  description: string | null;
  price: string | null;
  promoPrice: string | null;
  isPromo: boolean;
  imageUrl: string | null;
  category: string | null;
  line: string | null;
  available: boolean;
  stock: number | null;
  variants: { name: string; priceDelta: number; default?: boolean }[];
}

export interface PublicStorefront {
  tenantId: number;
  slug: string;
  businessName: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  instagram: string | null;
  website: string | null;
  whatsappNumber: string | null;
  webOrderRedirectEnabled: boolean;
  products: PublicProduct[];
}

export interface ResolvedTenant {
  tenantId: number;
  slug: string;
}

/** Resolves a public tenant by slug. Returns null for unknown/inactive slugs. */
export async function resolvePublicTenant(
  slug: string,
): Promise<ResolvedTenant | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select({ tenantId: tenants.id, slug: tenants.slug, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.slug, normalized))
    .limit(1);
  if (!row || row.status === "suspended") return null;
  return { tenantId: row.tenantId, slug: row.slug };
}

/** Public catalog for a tenant: available products only, tenant-scoped. */
export async function getPublicCatalog(tenantId: number): Promise<PublicProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      promoPrice: products.promoPrice,
      isPromo: products.isPromo,
      imageUrl: products.imageUrl,
      category: products.category,
      line: products.line,
      available: products.available,
      stock: products.stock,
      variants: products.variants,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.available, true)))
    .orderBy(asc(products.sortOrder), asc(products.name));

  return rows.map((row) => ({
    ...row,
    variants: row.variants ?? [],
  }));
}

/**
 * Full public storefront for a slug: business identity + catalog. Returns null
 * when the slug is unknown or suspended.
 */
export async function getStorefrontBySlug(
  slug: string,
): Promise<PublicStorefront | null> {
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) return null;

  const [[config], catalog] = await Promise.all([
    db
      .select({
        businessName: agentConfig.metaBusinessName,
        tagline: agentConfig.storefrontTagline,
        description: agentConfig.storefrontDescription,
        address: agentConfig.storefrontAddress,
        instagram: agentConfig.storefrontInstagram,
        website: agentConfig.storefrontWebsite,
        webOrderRedirectEnabled: agentConfig.webOrderRedirectEnabled,
        webOrderWhatsappNumber: agentConfig.webOrderWhatsappNumber,
        whatsappBotNumber: agentConfig.whatsappBotNumber,
        deliveryPhoneNumber: agentConfig.deliveryPhoneNumber,
      })
      .from(agentConfig)
      .where(eq(agentConfig.tenantId, tenant.tenantId))
      .limit(1),
    getPublicCatalog(tenant.tenantId),
  ]);

  const whatsappNumber =
    config?.webOrderWhatsappNumber?.trim() ||
    config?.whatsappBotNumber?.trim() ||
    config?.deliveryPhoneNumber?.trim() ||
    process.env.WHATSAPP_PHONE_NUMBER?.trim() ||
    null;

  return {
    tenantId: tenant.tenantId,
    slug: tenant.slug,
    businessName: config?.businessName?.trim() || tenant.slug,
    tagline: config?.tagline ?? null,
    description: config?.description ?? null,
    address: config?.address ?? null,
    instagram: config?.instagram ?? null,
    website: config?.website ?? null,
    whatsappNumber,
    webOrderRedirectEnabled: config?.webOrderRedirectEnabled ?? false,
    products: catalog,
  };
}
