import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/**
 * @param {unknown} row
 * @returns {{ id: string, name: string, shop_image_storage_key?: string | null } | null}
 */
function normalizeResolveRow(row) {
  if (row == null) return null;
  if (typeof row === "string") {
    return { id: row, name: "", shop_image_storage_key: null };
  }
  if (typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const id = r.id ?? r.shop_id ?? r.shopId;
  if (id == null || String(id).trim() === "") return null;
  const name = r.name ?? r.shop_name ?? r.shopName ?? "";
  const shop_image_storage_key =
    r.shop_image_storage_key ?? r.shop_image ?? r.shopImage ?? r.shop_photo ?? null;
  return {
    id: String(id),
    name: String(name),
    shop_image_storage_key:
      shop_image_storage_key != null ? String(shop_image_storage_key) : null
  };
}

/**
 * Response for GET /api/shops/resolve-by-domain (minimal fields only).
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
  return {
    shop_id: normalized.id,
    shop_name: normalized.name,
    shop_image
  };
}
