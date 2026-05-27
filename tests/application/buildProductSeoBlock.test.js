import { describe, it, expect } from "vitest";
import { env } from "../../src/config/env.js";
import {
  buildProductCanonicalUrl,
  buildProductSeoBlock
} from "../../src/application/services/seo/buildProductSeoBlock.js";

const base = env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "");

describe("buildProductCanonicalUrl", () => {
  it("appends products slug to shop base URL", () => {
    expect(
      buildProductCanonicalUrl({ custom_domain: "marketfresh.in" }, "tata-salt-1kg")
    ).toBe("https://marketfresh.in/products/tata-salt-1kg");
  });

  it("returns null when base or slug missing", () => {
    expect(buildProductCanonicalUrl({}, "slug")).toBeNull();
    expect(buildProductCanonicalUrl({ domain: "shop.com" }, "")).toBeNull();
  });
});

describe("buildProductSeoBlock", () => {
  const shop = {
    name: "Market Fresh",
    custom_domain: "marketfresh.in",
    locale: "en_IN",
    theme_color: "#FF8D21",
    twitter_card: "summary_large_image"
  };

  it("uses stored product SEO fields", () => {
    const seo = buildProductSeoBlock(
      {
        name: "Tata Salt 1kg",
        slug: "tata-salt-1kg",
        seo_title: "Custom product title",
        seo_description: "Custom product description."
      },
      shop,
      { productImageUrl: `${base}/products/salt.jpg` }
    );
    expect(seo.title).toBe("Custom product title");
    expect(seo.description).toBe("Custom product description.");
    expect(seo.canonicalUrl).toBe("https://marketfresh.in/products/tata-salt-1kg");
    expect(seo.og.type).toBe("product");
    expect(seo.og.image).toBe(`${base}/products/salt.jpg`);
    expect(seo.keywords).toBe("");
  });

  it("falls back to name and shop for title and description", () => {
    const seo = buildProductSeoBlock(
      {
        name: "Tata Salt 1kg",
        slug: "tata-salt-1kg",
        description: "Iodized salt."
      },
      shop
    );
    expect(seo.title).toBe("Tata Salt 1kg – Market Fresh");
    expect(seo.description).toBe("Iodized salt.");
  });

  it("trims long descriptions to 160 characters", () => {
    const seo = buildProductSeoBlock(
      {
        name: "Item",
        slug: "item",
        seo_description: "x".repeat(200)
      },
      shop
    );
    expect(seo.description).toHaveLength(160);
  });

  it("og image prefers product gallery then global image then shop logo", () => {
    const gallery = `${base}/gallery/1.jpg`;
    const global = `${base}/global.jpg`;
    const logo = `${base}/logo.jpg`;

    expect(
      buildProductSeoBlock(
        { name: "A", slug: "a", global_image_url: "global.jpg" },
        shop,
        { productImageUrl: gallery, shopImageUrl: logo }
      ).og.image
    ).toBe(gallery);

    expect(
      buildProductSeoBlock(
        { name: "A", slug: "a", global_image_url: "global.jpg" },
        shop,
        { shopImageUrl: logo }
      ).og.image
    ).toBe(global);

    expect(buildProductSeoBlock({ name: "A", slug: "a" }, shop, { shopImageUrl: logo }).og.image).toBe(
      logo
    );
  });
});
