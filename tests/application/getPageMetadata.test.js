import { describe, it, expect, vi } from "vitest";
import { createGetPageMetadata } from "../../src/application/services/seo/getPageMetadata.js";

describe("createGetPageMetadata", () => {
  const shopRow = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Demo Shop",
    custom_domain: "demo.example.com",
    shop_image_storage_key: null,
    banner_enabled: true,
    banner_storage_keys: []
  };

  it("returns shop page metadata", async () => {
    const shopLookupRepo = {
      findShopBrandingById: vi.fn().mockResolvedValue(shopRow)
    };
    const catalogRepo = { getProductSeoBySlugStorefront: vi.fn() };
    const getPageMetadata = createGetPageMetadata({ shopLookupRepo, catalogRepo });

    const out = await getPageMetadata(shopRow.id, "shop");
    expect(out.pageType).toBe("shop");
    expect(out.shopId).toBe(shopRow.id);
    expect(out.seo.title).toContain("Demo Shop");
    expect(catalogRepo.getProductSeoBySlugStorefront).not.toHaveBeenCalled();
  });

  it("returns product page metadata", async () => {
    const shopLookupRepo = {
      findShopBrandingById: vi.fn().mockResolvedValue(shopRow)
    };
    const catalogRepo = {
      getProductSeoBySlugStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Tata Salt",
          slug: "tata-salt",
          description: "Salt",
          availability: "in_stock",
          price_minor_per_unit: "2800",
          offer_price_minor_per_unit: "2500"
        },
        primary_image_storage_key: null
      })
    };
    const getPageMetadata = createGetPageMetadata({ shopLookupRepo, catalogRepo });

    const out = await getPageMetadata(shopRow.id, "product", "tata-salt");
    expect(out.pageType).toBe("product");
    expect(out.productId).toBe("22222222-2222-4222-8222-222222222222");
    expect(out.price).toEqual({ amount: 25, currency: "INR" });
    expect(out.seo.canonicalUrl).toBe("https://demo.example.com/products/tata-salt");
  });

  it("throws PRODUCT_NOT_FOUND when product missing", async () => {
    const shopLookupRepo = {
      findShopBrandingById: vi.fn().mockResolvedValue(shopRow)
    };
    const catalogRepo = {
      getProductSeoBySlugStorefront: vi.fn().mockResolvedValue(null)
    };
    const getPageMetadata = createGetPageMetadata({ shopLookupRepo, catalogRepo });

    await expect(getPageMetadata(shopRow.id, "product", "missing")).rejects.toMatchObject({
      statusCode: 404,
      code: "PRODUCT_NOT_FOUND"
    });
  });
});
