"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { fadeUpSmall, staggerContainer, cardEntrance } from "@/lib/animations";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import {
  deleteProductAction,
  toggleProductAvailabilityAction,
  createProductAction,
  updateProductAction,
  type ProductListItem,
  type FetchProductsResult,
} from "./actions";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProductsClientProps {
  initialData: FetchProductsResult;
  currentPage: number;
  currentQ: string;
  currentCategory: string;
  currentLine: string;
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <motion.div
      variants={fadeUpSmall}
      initial="hidden"
      animate="visible"
      className="col-span-full flex flex-col items-center justify-center py-24 rounded-xl"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      <div
        className="size-14 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      >
        <Search className="size-6" style={{ color: "rgba(255,255,255,0.2)" }} />
      </div>
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
        {hasFilters
          ? "No products match your filters."
          : "No products yet."}
      </p>
      <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
        {hasFilters
          ? "Try adjusting your search or filter criteria."
          : "Create your first product to get started."}
      </p>
      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="mt-4"
        >
          Clear filters
        </Button>
      )}
    </motion.div>
  );
}

// ─── Product card ────────────────────────────────────────────────────────────

function ProductCard({
  product,
  available,
  onToggle,
  onEdit,
  onDelete,
  isPending,
}: {
  product: ProductListItem;
  available: boolean;
  onToggle: (id: number, next: boolean) => void;
  onEdit: (p: ProductListItem) => void;
  onDelete: (p: ProductListItem) => void;
  isPending: boolean;
}) {
  const priceDisplay =
    product.price != null
      ? `$${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

  return (
    <motion.div
      variants={cardEntrance}
      className="rounded-xl flex flex-col gap-3 overflow-hidden transition-all duration-200"
      style={{ backgroundColor: "#111111", border: "1px solid #222222" }}
    >
      {/* Image preview */}
      {product.imageUrl ? (
        <div className="h-36 bg-black/40 overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className="h-24 flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
        >
          <span className="text-3xl" style={{ color: "rgba(255,255,255,0.1)" }}>
            🥘
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {/* Name & badges */}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {product.name}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {product.category && (
              <Badge
                variant="outline"
                className="text-[10px] border-white/10"
              >
                {product.category}
              </Badge>
            )}
            {product.line && (
              <Badge
                variant="secondary"
                className="text-[10px]"
              >
                {product.line}
              </Badge>
            )}
          </div>
        </div>

        {/* Price & stock */}
        <div className="flex items-center justify-between">
          <span
            className="text-base font-bold"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {priceDisplay}
          </span>
          <div className="flex items-center gap-1 text-xs">
            {product.stock != null ? (
              product.stock > 0 ? (
                <span style={{ color: "rgba(34,197,94,0.7)" }}>
                  Stock: {product.stock}
                </span>
              ) : (
                <span style={{ color: "rgba(239,68,68,0.7)" }}>
                  Out of stock
                </span>
              )
            ) : (
              <span style={{ color: "rgba(255,255,255,0.3)" }}>
                Unlimited
              </span>
            )}
          </div>
        </div>

        {/* Available switch */}
        <div
          className="flex items-center justify-between pt-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            Available
          </span>
          <Switch
            checked={available}
            disabled={isPending}
            onCheckedChange={(checked) => onToggle(product.id, checked)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(product)}
            className="flex-1 h-8 text-xs"
          >
            <Pencil className="size-3 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(product)}
            className="flex-1 h-8 text-xs"
            style={{ borderColor: "rgba(239,68,68,0.3)", color: "rgba(239,68,68,0.8)" }}
          >
            <Trash2 className="size-3 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Product Form ────────────────────────────────────────────────────────────

interface ProductFormProps {
  product: ProductListItem | null;
  categories: string[];
  lines: string[];
  onClose: () => void;
}

function ProductForm({ product, categories, lines, onClose }: ProductFormProps) {
  const router = useRouter();
  const isEdit = product !== null;
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [line, setLine] = useState(product?.line ?? "");
  const [stock, setStock] = useState(product?.stock?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [variantsJson, setVariantsJson] = useState(
    product?.variants ? JSON.stringify(product.variants, null, 2) : "",
  );
  const [available, setAvailable] = useState(product?.available ?? true);

  function handleSave() {
    let variants: unknown;
    if (variantsJson.trim()) {
      try {
        variants = JSON.parse(variantsJson);
      } catch {
        toast.error("Variants must be valid JSON");
        return;
      }
    }

    const data = {
      name: name || undefined,
      description: description || null,
      price: price ? Number(price) : null,
      category: category || null,
      line: line || null,
      stock: stock ? Number(stock) : null,
      imageUrl: imageUrl || null,
      available,
      variants: variants || null,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateProductAction(product!.id, data)
        : await createProductAction(data);

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Product updated" : "Product created");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-name" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Name *</label>
        <Input
          id="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          required
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-desc" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Description</label>
        <textarea
          id="pf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Product description (optional)"
          rows={3}
          className="flex w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {/* Price & Stock */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-price" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Price</label>
          <Input
            id="pf-price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-stock" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Stock</label>
          <Input
            id="pf-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Unlimited if empty"
          />
        </div>
      </div>

      {/* Category & Line */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-category" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Category</label>
          <select
            id="pf-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-line" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Line</label>
          <select
            id="pf-line"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Image URL */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-image" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Image URL</label>
        <Input
          id="pf-image"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
        />
        {imageUrl && (
          <div className="mt-1 w-20 h-20 rounded-lg overflow-hidden bg-black/40">
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
      </div>

      {/* Variants */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-variants" className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
          Variants{" "}
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            (JSON)
          </span>
        </label>
        <textarea
          id="pf-variants"
          value={variantsJson}
          onChange={(e) => setVariantsJson(e.target.value)}
          placeholder='[{"name": "Extra cheese", "priceDelta": 2.5}]'
          rows={4}
          className="flex w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
        />
      </div>

      {/* Available */}
      <div
        className="flex items-center justify-between rounded-md p-3"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col gap-0.5">
          <label htmlFor="pf-available" className="cursor-pointer text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
            Available
          </label>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Show product as available for sale
          </span>
        </div>
        <Switch
          id="pf-available"
          checked={available}
          onCheckedChange={setAvailable}
        />
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={isPending || !name.trim()}
        className="w-full mt-1"
      >
        {isPending
          ? isEdit
            ? "Saving..."
            : "Creating..."
          : isEdit
            ? "Save changes"
            : "Create product"}
      </Button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ProductsClient({
  initialData,
  currentPage,
  currentQ,
  currentCategory,
  currentLine,
}: ProductsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local optimistic availability state
  const [availability, setAvailability] = useState<Record<number, boolean>>(
    () =>
      Object.fromEntries(
        initialData.products.map((p) => [p.id, p.available]),
      ),
  );

  // Search state with debounce
  const [searchValue, setSearchValue] = useState(currentQ);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(
    null,
  );
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);

  const isSheetOpen = isNewProductOpen || selectedProduct !== null;
  const sheetProduct = isNewProductOpen ? null : selectedProduct;

  function handleCloseSheet() {
    setIsNewProductOpen(false);
    setSelectedProduct(null);
  }

  const navigate = useCallback(
    (params: {
      page?: string;
      q?: string;
      category?: string;
      line?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.category && params.category !== "all")
        sp.set("category", params.category);
      if (params.line && params.line !== "all")
        sp.set("line", params.line);
      if (params.page) sp.set("page", params.page);
      const qs = sp.toString();
      router.push(`/admin/products${qs ? `?${qs}` : ""}`);
    },
    [router],
  );

  // Debounced search navigation
  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: value, page: "1" });
    }, 350);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleCategoryChange(value: string) {
    navigate({ category: value, page: "1" });
  }

  function handleLineChange(value: string) {
    navigate({ line: value, page: "1" });
  }

  function handleClearFilters() {
    setSearchValue("");
    navigate({ q: "", category: "all", line: "all", page: "1" });
  }

  // ─── Toggle availability (optimistic) ─────────────────────────────────────

  function handleToggleAvailability(id: number, next: boolean) {
    setAvailability((prev) => ({ ...prev, [id]: next }));

    startTransition(async () => {
      const result = await toggleProductAvailabilityAction(id, next);
      if ("error" in result && result.error) {
        setAvailability((prev) => ({ ...prev, [id]: !next }));
        toast.error("Failed to update availability");
      } else {
        router.refresh();
      }
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const name = deleteTarget.name;
    setDeleteTarget(null);

    startTransition(async () => {
      const result = await deleteProductAction(id);
      if ("error" in result && result.error) {
        toast.error("Failed to delete product");
      } else {
        toast.success(`"${name}" deleted`);
        router.refresh();
      }
    });
  }

  const hasFilters =
    currentQ !== "" ||
    currentCategory !== "all" ||
    currentLine !== "all";

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row */}
      <motion.div
        variants={fadeUpSmall}
        initial="hidden"
        animate="visible"
        className="flex flex-col sm:flex-row sm:items-center gap-3"
      >
        {/* Search input */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
            style={{ color: "rgba(255,255,255,0.3)" }}
          />
          <Input
            placeholder="Search products..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {searchValue && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <Select
          value={currentCategory}
          onValueChange={handleCategoryChange}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {initialData.categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Line filter */}
        <Select value={currentLine} onValueChange={handleLineChange}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All lines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            {initialData.lines.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* New product button */}
        <Button
          onClick={() => setIsNewProductOpen(true)}
          className="shrink-0 h-9"
        >
          <Plus className="size-4 mr-1.5" />
          New Product
        </Button>
      </motion.div>

      {/* Product grid */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
      >
        {initialData.products.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onClear={handleClearFilters} />
        ) : (
          initialData.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              available={availability[product.id] ?? product.available}
              onToggle={handleToggleAvailability}
              onEdit={setSelectedProduct}
              onDelete={setDeleteTarget}
              isPending={isPending}
            />
          ))
        )}
      </motion.div>

      {/* Pagination */}
      {initialData.totalPages > 1 && (
        <motion.div
          variants={fadeUpSmall}
          initial="hidden"
          animate="visible"
          className="flex items-center justify-center gap-2 pt-2"
        >
          <Button
            type="button"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() =>
              navigate({ page: String(currentPage - 1) })
            }
            variant="outline"
            className="h-8 text-xs"
          >
            ← Previous
          </Button>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            {currentPage} / {initialData.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={currentPage >= initialData.totalPages}
            onClick={() =>
              navigate({ page: String(currentPage + 1) })
            }
            variant="outline"
            className="h-8 text-xs"
          >
            Next →
          </Button>
        </motion.div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseSheet();
        }}
      >
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-white/10">
            <SheetTitle
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              {isNewProductOpen ? "New Product" : "Edit Product"}
            </SheetTitle>
            <SheetDescription>
              {isNewProductOpen
                ? "Fill in the details to add a new product to the catalog."
                : `Update "${selectedProduct?.name}".`}
            </SheetDescription>
          </SheetHeader>
          <ProductForm
            key={
              isNewProductOpen
                ? "new"
                : `edit-${selectedProduct?.id}`
            }
            product={sheetProduct}
            categories={initialData.categories}
            lines={initialData.lines}
            onClose={handleCloseSheet}
          />
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
