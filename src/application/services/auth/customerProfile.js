import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/**
 * One object per active shop membership: customer display name + shop fields from models.
 * @param {{ display_name: string|null }} customer — `customers.display_name`
 * @param {{
 *   id: string,
 *   name: string,
 *   slug: string,
 *   status?: string | null,
 *   shop_image_storage_key?: string | null
 * }[]} shops — from `shops` joined via memberships (may include shop image storage key)
 */
export function buildProfileFromShops(customer, shops) {
  const name = customer.display_name ?? null;
  return shops.map((s) => {
    const key = s.shop_image_storage_key != null ? String(s.shop_image_storage_key).trim() : "";
    const image =
      key.length > 0
        ? {
            storageKey: key,
            url: toPublicMediaUrl(key)
          }
        : null;
    return {
      name,
      shopName: s.name,
      shopId: s.id,
      shopSlug: s.slug,
      isActive: String(s.status || "").trim().toLowerCase() === "active",
      status: s.status ?? null,
      image
    };
  });
}
