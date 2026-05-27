import { describe, it, expect } from "vitest";
import { env } from "../../src/config/env.js";
import {
  buildShopCanonicalUrl,
  buildShopSeoBlock
} from "../../src/application/services/seo/buildShopSeoBlock.js";

const base = env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "");

describe("buildShopCanonicalUrl", () => {
  it("prefers custom_domain over domain", () => {
    expect(
      buildShopCanonicalUrl({
        custom_domain: "marketfresh.in",
        domain: "marketfresh.example.com"
      })
    ).toBe("https://marketfresh.in/");
  });

  it("falls back to domain when custom_domain is empty", () => {
    expect(buildShopCanonicalUrl({ domain: "shop.example.com" })).toBe(
      "https://shop.example.com/"
    );
  });

  it("returns null when no host", () => {
    expect(buildShopCanonicalUrl({})).toBeNull();
  });

  it("strips scheme from stored domain values", () => {
    expect(buildShopCanonicalUrl({ custom_domain: "https://marketfresh.in/" })).toBe(
      "https://marketfresh.in/"
    );
  });
});

describe("buildShopSeoBlock", () => {
  it("uses stored seo fields when present", () => {
    const seo = buildShopSeoBlock(
      {
        name: "Market Fresh",
        seo_title: "Custom Title",
        seo_description: "Custom description.",
        seo_keywords: "grocery, delivery",
        locale: "en_IN",
        theme_color: "#FF8D21",
        custom_domain: "marketfresh.in",
        twitter_card: "summary_large_image"
      },
      { shopImageUrl: `${base}/logo.png` }
    );
    expect(seo.title).toBe("Custom Title");
    expect(seo.description).toBe("Custom description.");
    expect(seo.keywords).toBe("grocery, delivery");
    expect(seo.canonicalUrl).toBe("https://marketfresh.in/");
    expect(seo.locale).toBe("en_IN");
    expect(seo.themeColor).toBe("#FF8D21");
    expect(seo.og.type).toBe("website");
    expect(seo.og.imageWidth).toBe(1200);
    expect(seo.og.imageHeight).toBe(630);
    expect(seo.twitter.card).toBe("summary_large_image");
  });

  it("builds title from tagline and name when seo_title is empty", () => {
    const seo = buildShopSeoBlock({
      name: "Market Fresh",
      tagline: "Fresh every day"
    });
    expect(seo.title).toBe("Fresh every day – Market Fresh");
  });

  it("builds default title and description when SEO columns are missing", () => {
    const seo = buildShopSeoBlock({ name: "Demo Shop" });
    expect(seo.title).toBe("Demo Shop – Online Grocery");
    expect(seo.description).toBe("Order groceries online from Demo Shop.");
    expect(seo.keywords).toBe("");
    expect(seo.locale).toBe("en_IN");
    expect(seo.themeColor).toBeNull();
  });

  it("trims description to 160 characters", () => {
    const long = "a".repeat(200);
    const seo = buildShopSeoBlock({
      name: "Shop",
      seo_description: long
    });
    expect(seo.description).toHaveLength(160);
  });

  it("og.image prefers og_image_storage_key then shop image then banner", () => {
    const shopUrl = `${base}/shops/logo.png`;
    const bannerUrl = `${base}/banners/hero.jpg`;
    const fromKey = buildShopSeoBlock(
      {
        name: "Shop",
        og_image_storage_key: "shops/og.png"
      },
      { shopImageUrl: shopUrl, bannerImageUrls: [bannerUrl] }
    );
    expect(fromKey.og.image).toBe(`${base}/shops/og.png`);

    const fromShop = buildShopSeoBlock({ name: "Shop" }, { shopImageUrl: shopUrl });
    expect(fromShop.og.image).toBe(shopUrl);

    const fromBanner = buildShopSeoBlock(
      { name: "Shop" },
      { bannerImageUrls: [bannerUrl] }
    );
    expect(fromBanner.og.image).toBe(bannerUrl);
  });

  it("og.imageAlt defaults to shop name storefront", () => {
    const seo = buildShopSeoBlock({ name: "Market Fresh" });
    expect(seo.og.imageAlt).toBe("Market Fresh storefront");
  });
});
