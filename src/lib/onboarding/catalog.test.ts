import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalogCsv } from "./catalog";

test("catalog: parses a header + rows with aliases and defaults", () => {
  const csv = [
    "Title,Price,Description,Category,Available,Stock,Order",
    "Product A,99.99,Standard product,General,yes,10,1",
    "Service Basic,49.99,,Services,no,,2",
  ].join("\n");

  const rows = parseCatalogCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    name: "Product A",
    description: "Standard product",
    price: "99.99",
    promoPrice: null,
    isPromo: false,
    imageUrl: null,
    category: "General",
    line: null,
    available: true,
    stock: 10,
    sortOrder: 1,
  });
  assert.equal(rows[1].available, false);
  assert.equal(rows[1].stock, null);
  assert.equal(rows[1].sortOrder, 2);
});

test("catalog: handles quoted fields with commas and escaped quotes", () => {
  const csv = [
    "name,description,price",
    '"Bundles, deluxe","A ""premium"" bundle",499.99',
  ].join("\n");
  const rows = parseCatalogCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Bundles, deluxe");
  assert.equal(rows[0].description, 'A "premium" bundle');
});

test("catalog: skips rows without a name and empty input", () => {
  assert.deepEqual(parseCatalogCsv(""), []);
  assert.deepEqual(parseCatalogCsv("name,price"), []);
  const rows = parseCatalogCsv("name,price\n,9.99\nok,1.00");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "ok");
});

test("catalog: header without a name column yields no rows", () => {
  const csv = "price,description\n9.99,x";
  assert.deepEqual(parseCatalogCsv(csv), []);
});

test("catalog: sortOrder defaults to row position when absent", () => {
  const csv = "name,price\nA,1\nB,2\nC,3";
  const rows = parseCatalogCsv(csv);
  assert.deepEqual(
    rows.map((r) => r.sortOrder),
    [1, 2, 3],
  );
});

test("catalog: boolean and promo aliases", () => {
  const csv = "name,promo,active,salePrice\nA,true,false,5.00";
  const rows = parseCatalogCsv(csv);
  assert.equal(rows[0].isPromo, true);
  assert.equal(rows[0].available, false);
  assert.equal(rows[0].promoPrice, "5.00");
});
