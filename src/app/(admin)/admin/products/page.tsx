import { fetchProductsAction } from "./actions";
import ProductsClient from "./products-client";

export const metadata = {
  title: "Products — Admin",
};

export default async function ProductsPage(props: {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    category?: string;
    line?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const page = Number(sp?.page) || 1;
  const q = sp?.q || "";
  const category = sp?.category || "all";
  const line = sp?.line || "all";

  const result = await fetchProductsAction({ page, q, category, line });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          Products
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          Manage your product catalog — prices, stock, and availability
        </p>
      </div>
      <ProductsClient
        initialData={result}
        currentPage={page}
        currentQ={q}
        currentCategory={category}
        currentLine={line}
      />
    </div>
  );
}
