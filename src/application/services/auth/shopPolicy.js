import { AppError } from "../../../domain/errors/AppError.js";

/**
 * Purpose: Answer "can this shop take customers right now?"
 * Shop availability is `shops.status` only (`active` | `blocked` | `deleted`).
 */
export function shopAllowsCustomers(shop) {
  if (!shop) return false;
  return String(shop.status || "").trim().toLowerCase() === "active";
}

export function normalizeShopStatus(shop) {
  return String(shop?.status || "")
    .trim()
    .toLowerCase();
}

/**
 * User-facing message when a shop is not accepting traffic.
 * @param {{ status?: string } | null | undefined} shop
 */
export function shopUnavailableMessage(shop) {
  const status = normalizeShopStatus(shop);
  if (status === "blocked") return "Shop is blocked";
  if (status === "deleted") return "Shop is not available";
  return "Shop is not available";
}

/**
 * Stable API code for unavailable shops.
 * @param {{ status?: string } | null | undefined} shop
 */
export function shopUnavailableCode(shop) {
  const status = normalizeShopStatus(shop);
  if (status === "blocked") return "SHOP_BLOCKED";
  if (status === "deleted") return "SHOP_DELETED";
  return "SHOP_UNAVAILABLE";
}

/**
 * Throw when shop cannot accept customers / staff storefront traffic.
 * @param {{ status?: string } | null | undefined} shop
 * @param {{ statusCode?: number }} [opts]
 */
export function assertShopAllowsCustomers(shop, opts = {}) {
  if (shopAllowsCustomers(shop)) return;
  const statusCode = opts.statusCode ?? 403;
  throw new AppError(shopUnavailableMessage(shop), {
    statusCode,
    code: shopUnavailableCode(shop)
  });
}
