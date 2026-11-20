import { describe, it, expect } from "vitest";
import { buildListProductsStorefrontQuery } from "../../src/adapters/repositories/postgres/queries/buildListProductsStorefrontQuery.js";

describe("buildListProductsStorefrontQuery", () => {
  it("builds cursor pagination query without offset", () => {
    const out = buildListProductsStorefrontQuery({
      shopId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      categoryId: null,
      brandId: null,
      qPattern: "%milk%",
      availability: null,
      minPriceMinor: null,
      maxPriceMinor: null,
      limit: 20,
      offset: null,
      cursorCreatedAt: "2026-01-01T00:00:00.000Z",
      cursorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sortOrder: "desc",
      orderBySql: "sp.created_at DESC, sp.id DESC"
    });

    expect(out.text).toContain("AND (sp.created_at, sp.id) < ($9::timestamptz, $10::uuid)");
    expect(out.text).toContain("FROM shop_products sp");
    expect(out.text).toContain("LEFT JOIN global_products gp");
    expect(out.text).not.toContain("category_descendants");
    expect(out.text).not.toContain("global_category_images");
    expect(out.text).toContain(
      "CASE WHEN sp.offer_price_minor_per_unit IS NOT NULL AND sp.offer_price_minor_per_unit > 0 AND sp.offer_price_minor_per_unit < sp.price_minor_per_unit"
    );
    expect(out.text).not.toContain("c.scope = 'shared'");
    expect(out.text).not.toContain("c.scope = 'private' AND c.owner_shop_id = $1::uuid");
    expect(out.text).not.toContain("OFFSET $");
    expect(out.values).toHaveLength(10);
    // Unused null $2 must still be cast so Postgres can type the bind.
    expect(out.text).toContain("AND $2::uuid IS NULL");
    expect(out.values[1]).toBeNull();
  });

  it("types unused category bind when listing without category_id", () => {
    const out = buildListProductsStorefrontQuery({
      shopId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      categoryId: null,
      brandId: null,
      qPattern: null,
      availability: null,
      minPriceMinor: null,
      maxPriceMinor: null,
      limit: 5,
      offset: null,
      cursorCreatedAt: null,
      cursorId: null,
      sortOrder: "desc",
      orderBySql: "sp.created_at DESC, sp.id DESC"
    });

    expect(out.text).not.toContain("category_descendants");
    expect(out.text).toContain("AND $2::uuid IS NULL");
    expect(out.values[1]).toBeNull();
    expect(out.values).toHaveLength(8);
  });

  it("filters category tree existence by availability when set", () => {
    const out = buildListProductsStorefrontQuery({
      shopId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      categoryId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      brandId: null,
      qPattern: null,
      availability: "in_stock",
      minPriceMinor: null,
      maxPriceMinor: null,
      limit: 20,
      offset: null,
      cursorCreatedAt: null,
      cursorId: null,
      sortOrder: "desc",
      orderBySql: "sp.created_at DESC, sp.id DESC"
    });
    expect(out.text).toContain("sp2.availability = 'in_stock'");
    expect(out.text).toContain("category_descendants");
    expect(out.text).toContain("IN (SELECT id FROM effective_categories)");
    expect(out.text).not.toContain("global_category_images");
    expect(out.text).toContain("AND ($5::text IS NULL OR sp.availability = $5)");
  });

  it("builds offset query when offset is provided", () => {
    const out = buildListProductsStorefrontQuery({
      shopId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      categoryId: null,
      brandId: null,
      qPattern: null,
      availability: null,
      minPriceMinor: null,
      maxPriceMinor: null,
      limit: 20,
      offset: 100,
      cursorCreatedAt: null,
      cursorId: null,
      sortOrder: "desc",
      orderBySql: "sp.created_at DESC, sp.id DESC"
    });

    expect(out.text).toContain("OFFSET $9");
    expect(out.values.at(-1)).toBe(100);
  });
});
