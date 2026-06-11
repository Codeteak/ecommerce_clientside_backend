import { describe, it, expect } from "vitest";
import { categoryImageLateralJoinSql } from "../../src/adapters/repositories/postgres/queries/categoryImageSql.js";

describe("categoryImageLateralJoinSql", () => {
  it("includes global and shop_category fallback with priority ordering", () => {
    const sql = categoryImageLateralJoinSql();
    expect(sql).toContain("global_category_images");
    expect(sql).toContain("shop_category_images");
    expect(sql).toContain("c.scope = 'private'");
    expect(sql).toContain("c.owner_shop_id = $1::uuid");
    expect(sql).toContain("ORDER BY x.pri ASC");
    expect(sql).toContain("LEFT JOIN media_assets ma ON ma.id = img.media_asset_id");
  });

  it("supports custom aliases for product list joins", () => {
    const sql = categoryImageLateralJoinSql({ lateralAlias: "cimg", mediaAlias: "cma" });
    expect(sql).toContain(") cimg ON true");
    expect(sql).toContain("LEFT JOIN media_assets cma ON cma.id = cimg.media_asset_id");
  });
});
