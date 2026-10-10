// ─── Catalog CSV parser (tenant-scoped import) ───────────────────────────────
//
// Parses a products CSV into typed rows. Tolerant by design: unknown columns
// are ignored, and rows without a name are skipped. Header names are matched
// case-insensitively and against a small alias set, so exports from spreadsheets
// (or the seed sample) import without reformatting.

export interface CatalogRow {
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
  sortOrder: number;
}

/** Canonical → aliases (all normalized: lowercase, alphanumerics only). */
const COLUMN_ALIASES: Record<keyof CatalogRow, string[]> = {
  name: ["name", "title", "product", "productname", "item"],
  description: ["description", "desc", "details", "detail"],
  price: ["price", "unitprice", "amount"],
  promoPrice: ["promoprice", "saleprice", "discountprice", "offerprice"],
  isPromo: ["ispromo", "promo", "onsale", "sale"],
  imageUrl: ["imageurl", "image", "photo", "picture", "url", "img"],
  category: ["category", "cat", "type", "group"],
  line: ["line", "brand", "family", "collection"],
  available: ["available", "active", "enabled", "instock", "visible"],
  stock: ["stock", "quantity", "qty", "inventory"],
  sortOrder: ["sortorder", "order", "position", "sort", "rank"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits one CSV line, honoring double-quoted fields and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "y", "si", "sí", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function parseIntOrNull(value: string | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function clean(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Parses a products CSV. The first non-empty line is the header. Rows missing
 * a name are skipped; `sortOrder` defaults to the row position when absent.
 */
export function parseCatalogCsv(text: string): CatalogRow[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(normalizeHeader);
  const columnOf = (key: keyof CatalogRow): number => {
    for (const alias of COLUMN_ALIASES[key]) {
      const at = header.indexOf(alias);
      if (at !== -1) return at;
    }
    return -1;
  };

  const idx = {
    name: columnOf("name"),
    description: columnOf("description"),
    price: columnOf("price"),
    promoPrice: columnOf("promoPrice"),
    isPromo: columnOf("isPromo"),
    imageUrl: columnOf("imageUrl"),
    category: columnOf("category"),
    line: columnOf("line"),
    available: columnOf("available"),
    stock: columnOf("stock"),
    sortOrder: columnOf("sortOrder"),
  };
  if (idx.name === -1) return [];

  const rows: CatalogRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const name = clean(cols[idx.name]);
    if (!name) continue;

    const at = (i: number): string | undefined => (i === -1 ? undefined : cols[i]);
    const sortOrder = idx.sortOrder === -1 ? null : parseIntOrNull(at(idx.sortOrder));

    rows.push({
      name,
      description: clean(at(idx.description)),
      price: clean(at(idx.price)),
      promoPrice: clean(at(idx.promoPrice)),
      isPromo: parseBool(at(idx.isPromo), false),
      imageUrl: clean(at(idx.imageUrl)),
      category: clean(at(idx.category)),
      line: clean(at(idx.line)),
      available: parseBool(at(idx.available), true),
      stock: parseIntOrNull(at(idx.stock)),
      sortOrder: sortOrder ?? rows.length + 1,
    });
  }
  return rows;
}

/** Human-readable column reference for the CLI help text. */
export const CATALOG_COLUMNS =
  "name (required), description, price, promoPrice, isPromo, imageUrl, category, line, available, stock, sortOrder";
