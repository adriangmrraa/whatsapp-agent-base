import { notFound } from "next/navigation";
import { getStorefrontBySlug, type PublicProduct } from "@/lib/storefront";

// ─── Public digital menu ─────────────────────────────────────────────────────
//
// Unauthenticated, tenant-scoped by slug. A read-only, printable menu built from
// the tenant's available catalog — the same data the cart and the agent read.

export const dynamic = "force-dynamic";

function price(product: PublicProduct): string {
  const value =
    product.isPromo && product.promoPrice ? product.promoPrice : product.price;
  return value ? `$${Number(value).toFixed(2)}` : "Consultar";
}

export default async function DigitalMenuPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const storefront = await getStorefrontBySlug(tenant);
  if (!storefront) notFound();

  const byCategory = new Map<string, PublicProduct[]>();
  for (const product of storefront.products) {
    const key = product.category?.trim() || product.line?.trim() || "Productos";
    const list = byCategory.get(key) ?? [];
    list.push(product);
    byCategory.set(key, list);
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Carta digital</h1>
        <p className="text-muted-foreground">{storefront.businessName}</p>
        <a className="text-sm underline" href={`/store/${storefront.slug}`}>
          Hacer un pedido
        </a>
      </header>

      {storefront.products.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay productos cargados.</p>
      ) : (
        [...byCategory.entries()].map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="text-xl font-semibold border-b border-border pb-1">
              {category}
            </h2>
            <ul className="space-y-3">
              {items.map((product) => (
                <li key={product.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    {product.description ? (
                      <p className="text-sm text-muted-foreground">{product.description}</p>
                    ) : null}
                  </div>
                  <p className="whitespace-nowrap font-semibold">{price(product)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
