import { buildShopCanonicalUrl } from "./buildShopSeoBlock.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 160;
const DEFAULT_LOCALE = "en_IN";
const DEFAULT_TWITTER_CARD = "summary_large_image";

/**
 * @param {string | null | undefined} text
 * @param {number} maxLen
 */
function trimToMax(text, maxLen) {
  const s = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/**
 * @param {{ custom_domain?: string | null, domain?: string | null }} shop
 * @param {string} slug
 * @returns {string | null}
 */
export function buildProductCanonicalUrl(shop, slug) {
  const base = buildShopCanonicalUrl(shop);
  const s = String(slug ?? "").trim();
  if (!base || !s) return null;
  return `${base.replace(/\/+$/, "")}/products/${s}`;
}

/**
 * @param {{
 *   name: string,
 *   slug: string,
 *   description?: string | null,
 *   seo_title?: string | null,
 *   seo_description?: string | null,
 *   global_image_url?: string | null
 * }} product
 * @param {{
 *   name: string,
 *   locale?: string | null,
 *   theme_color?: string | null,
 *   domain?: string | null,
 *   custom_domain?: string | null,
 *   twitter_card?: string | null
 * }} shop
 * @param {{ productImageUrl?: string | null, shopImageUrl?: string | null }} urls
 */
export function buildProductSeoBlock(product, shop, urls = {}) {
  const productName = String(product.name ?? "").trim() || "Product";
  const shopName = String(shop.name ?? "").trim() || "Shop";
  const slug = String(product.slug ?? "").trim();

  const storedTitle = product.seo_title != null ? String(product.seo_title).trim() : "";
  const title = trimToMax(
    storedTitle || `${productName} – ${shopName}`,
    MAX_TITLE
  );

  const storedDesc = product.seo_description != null ? String(product.seo_description).trim() : "";
  const descFromProduct =
    product.description != null ? String(product.description).trim() : "";
  const description = trimToMax(
    storedDesc || descFromProduct || `Buy ${productName} online at ${shopName}.`,
    MAX_DESCRIPTION
  );

  const locale =
    shop.locale != null && String(shop.locale).trim()
      ? String(shop.locale).trim()
      : DEFAULT_LOCALE;

  const themeColor =
    shop.theme_color != null && String(shop.theme_color).trim()
      ? String(shop.theme_color).trim()
      : null;

  let globalImage = null;
  const rawGlobal = product.global_image_url != null ? String(product.global_image_url).trim() : "";
  if (rawGlobal) {
    globalImage = /^https?:\/\//i.test(rawGlobal) ? rawGlobal : toPublicMediaUrl(rawGlobal);
  }

  const productImageUrl = urls.productImageUrl ?? null;
  const shopImageUrl = urls.shopImageUrl ?? null;
  const ogImage = productImageUrl || globalImage || shopImageUrl || null;

  const ogImageAlt = `${productName} – ${shopName}`;

  const twitterCard =
    shop.twitter_card != null && String(shop.twitter_card).trim()
      ? String(shop.twitter_card).trim()
      : DEFAULT_TWITTER_CARD;

  return {
    title,
    description,
    keywords: "",
    canonicalUrl: buildProductCanonicalUrl(shop, slug),
    locale,
    themeColor,
    og: {
      type: "product",
      image: ogImage,
      imageWidth: OG_WIDTH,
      imageHeight: OG_HEIGHT,
      imageAlt: ogImageAlt
    },
    twitter: {
      card: twitterCard
    }
  };
}
