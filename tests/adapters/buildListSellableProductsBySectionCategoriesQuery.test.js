import { describe, it, expect } from "vitest";
import { buildListSellableProductsBySectionCategoriesQuery } from "../../src/adapters/repositories/postgres/queries/buildListSellableProductsBySectionCategoriesQuery.js";

describe("buildListSellableProductsBySectionCategoriesQuery", () => {
  const sql = buildListSellableProductsBySectionCategoriesQuery();

  it("keeps the newest 50 products on each shelf in one search", () => {
    expect(sql).toContain("unnest($2::uuid[], $3::uuid[])");
    expect(sql).toContain("JOIN global_categories c ON c.id = i.category_id");
    expect(sql).toContain("PARTITION BY ct.section_id");
    expect(sql).toContain("ORDER BY sp.updated_at DESC NULLS LAST, sp.id ASC");
    expect(sql).toContain("WHERE rn <= $4::int");
    expect(sql).toContain("sp.status = 'active'");
    expect(sql).toContain("sp.availability = 'in_stock'");
    expect(sql).toContain("COALESCE(sp.global_category_id, gp.global_category_id) = ct.category_id");
    expect(sql).toContain("SELECT DISTINCT section_id, category_id");
    expect(sql).toContain("shop_product_images");
    expect(sql).not.toContain("LIMIT $4");
    expect(sql).not.toContain("LIMIT $3");
  });
});
