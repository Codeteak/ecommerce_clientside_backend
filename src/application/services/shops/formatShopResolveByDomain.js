import { formatShopBranding } from "./formatShopBranding.js";

/**
 * @param {{ id: string, name: string, shop_image_storage_key?: string | null } | null | undefined} row
 */
export function formatShopResolveByDomain(row) {
  return formatShopBranding(row);
}
