import { notFound } from "next/navigation";
import { getStorefrontBySlug } from "@/lib/storefront";
import StorefrontClient from "@/components/storefront/storefront-client";

// ─── Public storefront landing ───────────────────────────────────────────────
//
// Unauthenticated, tenant-scoped by slug. Renders the tenant's own business
// identity + catalog and mounts the cart/checkout. No vertical hardcoding: the
// page is driven entirely by the tenant's config and products.

export const dynamic = "force-dynamic";

function instagramUrl(value: string): string {
  if (value.startsWith("http")) return value;
  return `https://instagram.com/${value.replace(/^@/, "")}`;
}

function websiteUrl(value: string): string {
  return value.startsWith("http") ? value : `https://${value}`;
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const storefront = await getStorefrontBySlug(tenant);
  if (!storefront) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl p-6 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{storefront.businessName}</h1>
        {storefront.tagline ? (
          <p className="text-lg text-muted-foreground">{storefront.tagline}</p>
        ) : null}
        {storefront.description ? <p className="text-sm">{storefront.description}</p> : null}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {storefront.address ? <span>{storefront.address}</span> : null}
          {storefront.instagram ? (
            <a
              className="underline"
              href={instagramUrl(storefront.instagram)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
          ) : null}
          {storefront.website ? (
            <a
              className="underline"
              href={websiteUrl(storefront.website)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Sitio web
            </a>
          ) : null}
          <a className="underline" href={`/menu/${storefront.slug}`}>
            Menú digital
          </a>
        </div>
      </header>

      {storefront.products.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay productos cargados.</p>
      ) : (
        <StorefrontClient slug={storefront.slug} products={storefront.products} />
      )}
    </main>
  );
}
