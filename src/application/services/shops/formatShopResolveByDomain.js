import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { buildShopSeoBlock } from "../seo/buildShopSeoBlock.js";

/**
 * @param {unknown} row
 * @returns {{
 *   id: string,
 *   name: string,
 *   domain?: string | null,
 *   custom_domain?: string | null,
 *   seo_title?: string | null,
 *   seo_description?: string | null,
 *   seo_keywords?: string | null,
 *   tagline?: string | null,
 *   locale?: string | null,
 *   theme_color?: string | null,
 *   og_image_storage_key?: string | null,
 *   og_image_alt?: string | null,
 *   twitter_card?: string | null,
 *   shop_image_storage_key?: string | null,
 *   banner_enabled: boolean,
 *   banner_storage_keys: string[]
 * } | null}
 */
function normalizeResolveRow(row) {
  if (row == null) return null;
  if (typeof row === "string") {
    return {
      id: row,
      name: "",
      shop_image_storage_key: null,
      banner_enabled: true,
      banner_storage_keys: []
    };
  }
  if (typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const id = r.id ?? r.shop_id ?? r.shopId;
  if (id == null || String(id).trim() === "") return null;
  const name = r.name ?? r.shop_name ?? r.shopName ?? "";
  const shop_image_storage_key =
    r.shop_image_storage_key ?? r.shop_image ?? r.shopImage ?? r.shop_photo ?? null;
  const banner_enabled = r.banner_enabled !== false;
  let banner_storage_keys = [];
  if (Array.isArray(r.banner_storage_keys)) {
    banner_storage_keys = r.banner_storage_keys.map((k) => String(k)).filter(Boolean);
  }
  return {
    id: String(id),
    name: String(name),
    domain: r.domain != null ? String(r.domain) : null,
    custom_domain: r.custom_domain != null ? String(r.custom_domain) : null,
    seo_title: r.seo_title != null ? String(r.seo_title) : null,
    seo_description: r.seo_description != null ? String(r.seo_description) : null,
    seo_keywords: r.seo_keywords != null ? String(r.seo_keywords) : null,
    tagline: r.tagline != null ? String(r.tagline) : null,
    locale: r.locale != null ? String(r.locale) : null,
    theme_color: r.theme_color != null ? String(r.theme_color) : null,
    og_image_storage_key:
      r.og_image_storage_key != null ? String(r.og_image_storage_key) : null,
    og_image_alt: r.og_image_alt != null ? String(r.og_image_alt) : null,
    twitter_card: r.twitter_card != null ? String(r.twitter_card) : null,
    shop_image_storage_key:
      shop_image_storage_key != null ? String(shop_image_storage_key) : null,
    banner_enabled,
    banner_storage_keys
  };
}

/**
 * @param {boolean} enabled
 * @param {string[]} storageKeys
 * @returns {string[]}
 */
function formatBannerImages(enabled, storageKeys) {
  if (!enabled) return [];
  const keys = Array.isArray(storageKeys) ? storageKeys : [];
  const urls = [];
  for (const key of keys) {
    const trimmed = key != null ? String(key).trim() : "";
    if (!trimmed) continue;
    const url = toPublicMediaUrl(trimmed);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Response for GET /api/shops/resolve-by-domain.
 * @param {unknown} row
 */
export function formatShopResolveByDomain(row) {
  const normalized = normalizeResolveRow(row);
  if (!normalized) return null;
  const key =
    normalized.shop_image_storage_key != null
      ? String(normalized.shop_image_storage_key).trim()
      : "";
  const shop_image = key.length > 0 ? toPublicMediaUrl(key) : null;
  const banner_images = formatBannerImages(
    normalized.banner_enabled,
    normalized.banner_storage_keys
  );

  const seo = buildShopSeoBlock(normalized, {
    shopImageUrl: shop_image,
    bannerImageUrls: banner_images
  });

  return {
    shop_id: normalized.id,
    shop_name: normalized.name,
    shop_image,
    banner_enabled: normalized.banner_enabled,
    banner_images,
    seo
  };
}
