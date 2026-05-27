import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/**
 * @param {{
 *   shop_image_storage_key?: string | null,
 *   banner_enabled?: boolean,
 *   banner_storage_keys?: string[]
 * }} row
 */
export function shopBrandingMediaUrls(row) {
  const key =
    row.shop_image_storage_key != null ? String(row.shop_image_storage_key).trim() : "";
  const shopImageUrl = key.length > 0 ? toPublicMediaUrl(key) : null;

  const bannerEnabled = row.banner_enabled !== false;
  const keys = bannerEnabled && Array.isArray(row.banner_storage_keys) ? row.banner_storage_keys : [];
  const bannerImageUrls = [];
  for (const k of keys) {
    const trimmed = k != null ? String(k).trim() : "";
    if (!trimmed) continue;
    const url = toPublicMediaUrl(trimmed);
    if (url) bannerImageUrls.push(url);
  }

  return { shopImageUrl, bannerImageUrls };
}
