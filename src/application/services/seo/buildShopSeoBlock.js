import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MAX_DESCRIPTION = 160;
const DEFAULT_LOCALE = "en_IN";
const DEFAULT_TWITTER_CARD = "summary_large_image";

/**
 * @param {{ custom_domain?: string | null, domain?: string | null }} shop
 * @returns {string | null}
 */
export function buildShopCanonicalUrl(shop) {
  const custom = shop?.custom_domain != null ? String(shop.custom_domain).trim() : "";
  const domain = shop?.domain != null ? String(shop.domain).trim() : "";
  const host = custom || domain;
  if (!host) return null;
  const normalized = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!normalized) return null;
  return `https://${normalized}/`;
}

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
 * @param {string | null | undefined} storageKey
 * @returns {string | null}
 */
function storageKeyToUrl(storageKey) {
  const key = storageKey != null ? String(storageKey).trim() : "";
  if (!key) return null;
  return toPublicMediaUrl(key);
}

/**
 * @param {{
 *   name: string,
 *   seo_title?: string | null,
 *   seo_description?: string | null,
 *   seo_keywords?: string | null,
 *   tagline?: string | null,
 *   locale?: string | null,
 *   theme_color?: string | null,
 *   domain?: string | null,
 *   custom_domain?: string | null,
 *   og_image_storage_key?: string | null,
 *   og_image_alt?: string | null,
 *   twitter_card?: string | null
 * }} shop
 * @param {{ shopImageUrl?: string | null, bannerImageUrls?: string[] }} urls
 */
export function buildShopSeoBlock(shop, urls = {}) {
  const name = String(shop.name ?? "").trim() || "Shop";
  const tagline = shop.tagline != null ? String(shop.tagline).trim() : "";
  const storedTitle = shop.seo_title != null ? String(shop.seo_title).trim() : "";

  let title = storedTitle;
  if (!title) {
    if (tagline) {
      title = `${tagline} – ${name}`;
    } else {
      title = `${name} – Online Grocery`;
    }
  }

  const storedDesc = shop.seo_description != null ? String(shop.seo_description).trim() : "";
  const description = trimToMax(
    storedDesc || `Order groceries online from ${name}.`,
    MAX_DESCRIPTION
  );

  const keywords = shop.seo_keywords != null ? String(shop.seo_keywords).trim() : "";

  const locale =
    shop.locale != null && String(shop.locale).trim()
      ? String(shop.locale).trim()
      : DEFAULT_LOCALE;

  const themeColor =
    shop.theme_color != null && String(shop.theme_color).trim()
      ? String(shop.theme_color).trim()
      : null;

  const ogFromKey = storageKeyToUrl(shop.og_image_storage_key);
  const shopImageUrl = urls.shopImageUrl ?? null;
  const bannerUrls = Array.isArray(urls.bannerImageUrls) ? urls.bannerImageUrls : [];
  const ogImage = ogFromKey || shopImageUrl || bannerUrls[0] || null;

  const ogImageAlt =
    shop.og_image_alt != null && String(shop.og_image_alt).trim()
      ? String(shop.og_image_alt).trim()
      : `${name} storefront`;

  const twitterCard =
    shop.twitter_card != null && String(shop.twitter_card).trim()
      ? String(shop.twitter_card).trim()
      : DEFAULT_TWITTER_CARD;

  return {
    title,
    description,
    keywords,
    canonicalUrl: buildShopCanonicalUrl(shop),
    locale,
    themeColor,
    og: {
      type: "website",
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
