import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();

vi.mock("../../src/infra/db/pool.js", () => ({
  pool: { connect }
}));

const { CatalogRepoPg } = await import("../../src/adapters/repositories/postgres/catalog/CatalogRepoPg.js");

const shopId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("listProductsStorefront category images", () => {
  beforeEach(() => {
    connect.mockReset();
  });

  it("loads one image for each category on the page", async () => {
    const calls = [];
    const client = {
      query: vi.fn(async (sql, params) => {
        const text = typeof sql === "string" ? sql : sql.text;
        calls.push(text);
        if (text.includes("set_config")) return { rows: [] };
        if (text.includes("FROM shop_products")) {
          return {
            rows: [
              { id: "p1", category_id: categoryId },
              { id: "p2", category_id: categoryId },
              { id: "p3", category_id: null }
            ]
          };
        }
        if (text.includes("global_category_images")) {
          expect(params[1]).toEqual([categoryId]);
          return {
            rows: [
              {
                id: categoryId,
                image_media_id: "m1",
                image_storage_key: "categories/veg.jpg",
                image_content_type: "image/jpeg"
              }
            ]
          };
        }
        throw new Error(text);
      }),
      release: vi.fn()
    };
    connect.mockResolvedValue(client);

    const rows = await new CatalogRepoPg().listProductsStorefront(shopId, {
      categoryId: null,
      brandId: null,
      qPattern: null,
      limit: 24,
      offset: null,
      cursorCreatedAt: null,
      cursorId: null,
      availability: "in_stock",
      minPriceMinor: null,
      maxPriceMinor: null,
      sortBy: "created_at",
      sortOrder: "desc",
      includeDescendants: false
    });

    const productSql = calls.find((sql) => sql.includes("FROM shop_products"));
    expect(productSql).not.toContain("category_descendants");
    expect(calls.filter((sql) => sql.includes("global_category_images"))).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category_image_media_id: "m1",
      category_image_storage_key: "categories/veg.jpg",
      category_image_content_type: "image/jpeg"
    });
    expect(rows[1].category_image_storage_key).toBe("categories/veg.jpg");
    expect(rows[2]).toMatchObject({
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
