"use client";

import { useMemo, useState } from "react";
import type { PublicProduct } from "@/lib/storefront";

// ─── Storefront cart + structured checkout (client) ──────────────────────────
//
// Renders the tenant's loaded catalog and posts a cart to the public checkout.
// It sends only product ids + quantities — prices are computed server-side. The
// receipt carries the WEB:<ref> the customer hands to the WhatsApp agent.

interface StorefrontClientProps {
  slug: string;
  products: PublicProduct[];
}

interface Receipt {
  orderId: number;
  reference: string;
  total: number;
  whatsappUrl: string | null;
}

function effectivePrice(product: PublicProduct): number {
  const value =
    product.isPromo && product.promoPrice ? product.promoPrice : product.price;
  return value ? Number(value) : 0;
}

export default function StorefrontClient({ slug, products }: StorefrontClientProps) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const product = products.find((item) => item.id === Number(id));
          if (!product) return null;
          return { product, quantity, lineTotal: effectivePrice(product) * quantity };
        })
        .filter((line): line is { product: PublicProduct; quantity: number; lineTotal: number } =>
          Boolean(line),
        ),
    [cart, products],
  );

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  function setQuantity(productId: number, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(quantity, 99);
      return next;
    });
  }

  async function submit() {
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          items: lines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
          customerName: name || undefined,
          phoneNumber: phone || undefined,
          address: address || undefined,
          notes: notes || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Receipt & {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "checkout_failed");
        return;
      }
      setReceipt(body);
      setCart({});
    } catch {
      setError("checkout_failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-xl font-semibold">Pedido registrado</h2>
        <p className="text-sm text-muted-foreground">
          Referencia <span className="font-mono">{receipt.reference}</span> · Total $
          {receipt.total.toFixed(2)}
        </p>
        {receipt.whatsappUrl ? (
          <a
            href={receipt.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-primary px-5 py-3 text-primary-foreground"
          >
            Confirmar por WhatsApp
          </a>
        ) : (
          <p className="text-sm">
            Enviá la referencia <span className="font-mono">{receipt.reference}</span> por
            WhatsApp para confirmar el pedido.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {products.map((product) => {
          const quantity = cart[product.id] ?? 0;
          return (
            <div key={product.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{product.name}</p>
                  {product.description ? (
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  ) : null}
                </div>
                <p className="whitespace-nowrap font-semibold">
                  ${effectivePrice(product).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, quantity - 1)}
                  className="h-8 w-8 rounded-md border border-border"
                  aria-label={`Quitar ${product.name}`}
                >
                  −
                </button>
                <span className="w-6 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, quantity + 1)}
                  className="h-8 w-8 rounded-md border border-border"
                  aria-label={`Agregar ${product.name}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Tus datos</h3>
        <input
          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
          placeholder="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
          placeholder="Teléfono"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <input
          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
          placeholder="Dirección de entrega"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <textarea
          className="w-full rounded-md border border-border bg-transparent px-3 py-2"
          placeholder="Notas (opcional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="button"
          disabled={lines.length === 0 || submitting}
          onClick={submit}
          className="w-full rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Enviando…" : `Confirmar pedido · $${total.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
