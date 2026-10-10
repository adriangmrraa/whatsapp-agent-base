"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, asc, ilike, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireTenantId } from "@/lib/tenants";

const PAGE_SIZE = 20;

// ─── Public types ────────────────────────────────────────────────────────────

export type ProductListItem = {
  id: number;
  name: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  category: string | null;
  line: string | null;
  stock: number | null;
  available: boolean;
  variants: { name: string; priceDelta: number; default?: boolean }[];
  createdAt: string;
};

export type FetchProductsResult = {
  products: ProductListItem[];
  totalPages: number;
  total: number;
  categories: string[];
  lines: string[];
};

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const variantItemSchema = z.object({
  name: z.string(),
  priceDelta: z.number(),
  default: z.boolean().optional(),
});

const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.number().positive("Price must be positive").optional().nullable(),
  category: z.string().optional().nullable(),
  line: z.string().optional().nullable(),
  stock: z
    .number()
    .int("Stock must be an integer")
    .nonnegative()
    .optional()
    .nullable(),
  available: z.boolean().optional().default(true),
  imageUrl: z.string().optional().nullable(),
  variants: z.array(variantItemSchema).optional().nullable(),
});

const updateProductSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional().nullable(),
  price: z.number().positive("Price must be positive").optional().nullable(),
  category: z.string().optional().nullable(),
  line: z.string().optional().nullable(),
  stock: z
    .number()
    .int("Stock must be an integer")
    .nonnegative()
    .optional()
    .nullable(),
  available: z.boolean().optional(),
  imageUrl: z.string().optional().nullable(),
  variants: z.array(variantItemSchema).optional().nullable(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildWhereClause(
  tenantId: number,
  params: {
    q?: string;
    category?: string;
    line?: string;
  },
) {
  const conditions: ReturnType<typeof eq | typeof ilike>[] = [
    eq(products.tenantId, tenantId),
  ];

  if (params.q) {
    conditions.push(ilike(products.name, `%${params.q}%`));
  }
  if (params.category && params.category !== "all") {
    conditions.push(eq(products.category, params.category));
  }
  if (params.line && params.line !== "all") {
    conditions.push(eq(products.line, params.line));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

type ProductRow = {
  id: number;
  name: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  category: string | null;
  line: string | null;
  stock: number | null;
  available: boolean;
  variants: unknown;
  createdAt: Date;
};

function mapProduct(p: ProductRow): ProductListItem {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    category: p.category,
    line: p.line,
    stock: p.stock,
    available: p.available,
    variants: (p.variants ?? []) as ProductListItem["variants"],
    createdAt: p.createdAt.toISOString(),
  };
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchProductsAction(params: {
  page?: number;
  q?: string;
  category?: string;
  line?: string;
}): Promise<FetchProductsResult> {
  const tenantId = await requireTenantId();
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const where = buildWhereClause(tenantId, params);

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(where);

  const items = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(asc(products.sortOrder), asc(products.name))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Unique values for filter dropdowns
  const categoryRows = await db
    .select({ value: products.category })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .groupBy(products.category);

  const lineRows = await db
    .select({ value: products.line })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .groupBy(products.line);

  return {
    products: items.map(mapProduct),
    totalPages: Math.ceil(Number(total) / PAGE_SIZE),
    total: Number(total),
    categories: categoryRows
      .map((r) => r.value)
      .filter((v): v is string => v !== null),
    lines: lineRows
      .map((r) => r.value)
      .filter((v): v is string => v !== null),
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createProductAction(data: unknown) {
  const tenantId = await requireTenantId();
  const parsed = createProductSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { variants, ...rest } = parsed.data;

  await db.insert(products).values({
    ...rest,
    tenantId,
    price: rest.price?.toString() ?? null,
    imageUrl: rest.imageUrl ?? null,
    variants: variants ?? [],
    updatedAt: new Date(),
  });

  revalidatePath("/admin/products");
  return { success: true };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateProductAction(id: number, data: unknown) {
  const tenantId = await requireTenantId();
  const parsed = updateProductSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const updateData: Record<string, unknown> = {};
  const d = parsed.data;

  if (d.name !== undefined) updateData.name = d.name;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.price !== undefined) updateData.price = d.price?.toString() ?? null;
  if (d.category !== undefined) updateData.category = d.category;
  if (d.line !== undefined) updateData.line = d.line;
  if (d.stock !== undefined) updateData.stock = d.stock;
  if (d.available !== undefined) updateData.available = d.available;
  if (d.imageUrl !== undefined) updateData.imageUrl = d.imageUrl;
  if (d.variants !== undefined) updateData.variants = d.variants;
  updateData.updatedAt = new Date();

  await db
    .update(products)
    .set(updateData)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));

  revalidatePath("/admin/products");
  return { success: true };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteProductAction(id: number) {
  const tenantId = await requireTenantId();
  await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
  revalidatePath("/admin/products");
  return { success: true };
}

// ─── Toggle availability ─────────────────────────────────────────────────────

export async function toggleProductAvailabilityAction(
  id: number,
  available: boolean,
) {
  const tenantId = await requireTenantId();
  await db
    .update(products)
    .set({ available, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)));

  revalidatePath("/admin/products");
  return { success: true };
}
