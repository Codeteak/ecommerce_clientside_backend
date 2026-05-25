import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/**
 * @param {{ id: string, name: string, shop_image_storage_key?: string | null } | null | undefined} row
 */
export function formatShopBranding(row) {
  if (!row) return null;
  const key =
    row.shop_image_storage_key != null ? String(row.shop_image_storage_key).trim() : "";
  const shopImage = key.length > 0 ? toPublicMediaUrl(key) : null;
  return {
    shopId: row.id,
    shopName: row.name,
    shopImage,
    shop_name: row.name,
    shop_image: shopImage,
    shop_photo: shopImage
  };
}
