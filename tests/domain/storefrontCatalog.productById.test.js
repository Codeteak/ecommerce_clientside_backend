import { describe, it, expect, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";

describe("storefrontCatalog getProductById", () => {
  it("maps product detail by shop product UUID", async () => {
    const catalogRepo = {
      getProductByIdStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Apple",
          slug: "apple",
          base_unit: "kg",
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: "90",
          availability: "in_stock",
          category_id: "22222222-2222-4222-8222-222222222222"
        },
        gallery: [
          {
            media_asset_id: "33333333-3333-4333-8333-333333333333",
            sort_order: 1,
            storage_key: "products/apple.jpg",
            content_type: "image/jpeg"
          }
        ]
      })
    };
    const storefrontCatalog = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      catalogCache: { wrap: vi.fn((_k, _t, fn) => fn()) },
      catalogCacheTtlSec: 0
    });

    const out = await storefrontCatalog.getProductById(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );

    expect(catalogRepo.getProductByIdStorefront).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(out).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "apple",
      category_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(out.images).toHaveLength(1);
  });
});
