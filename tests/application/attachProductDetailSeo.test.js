import { describe, it, expect, vi } from "vitest";
import { attachProductDetailSeo } from "../../src/application/services/seo/attachProductDetailSeo.js";

describe("attachProductDetailSeo", () => {
  it("adds seo block to product detail", async () => {
    const detail = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Tata Salt",
      slug: "tata-salt",
      description: "Iodized salt",
      images: [{ url: "https://cdn.example.com/salt.jpg" }]
    };
    const data = {
      product: {
        seo_title: "Custom SEO title",
        seo_description: "Custom SEO description."
      }
    };
    const shopLookupRepo = {
      findShopBrandingById: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        name: "GreenLeaf Fresh Mart",
        custom_domain: "greenleaf.example.com",
        shop_image_storage_key: null,
        banner_enabled: false,
        banner_storage_keys: []
      })
    };

    const out = await attachProductDetailSeo(
      "00000000-0000-4000-8000-000000000001",
      data,
      detail,
      shopLookupRepo
    );

    expect(out.seo).toMatchObject({
      title: "Custom SEO title",
      description: "Custom SEO description.",
      canonicalUrl: "https://greenleaf.example.com/products/tata-salt",
      og: { type: "product", image: "https://cdn.example.com/salt.jpg" }
    });
    expect(out.id).toBe(detail.id);
  });
});
