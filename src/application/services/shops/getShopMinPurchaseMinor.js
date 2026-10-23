import { parseMinPurchaseMinor } from "../../../domain/ordering/minPurchase.js";

/**
 * @param {{
 *   shopResolveCache: { getShopServiceHub: Function },
 *   shopServiceAreaRepo: { getShopHubForServiceCheck: Function }
 * }} deps
 */
export function createGetShopMinPurchaseMinor({ shopResolveCache, shopServiceAreaRepo }) {
  return async function getShopMinPurchaseMinor(shopId) {
    if (!shopId || !shopServiceAreaRepo) return 0;
    const row = shopResolveCache
      ? await shopResolveCache.getShopServiceHub(shopId, shopServiceAreaRepo)
      : await shopServiceAreaRepo.getShopHubForServiceCheck(shopId);
    return parseMinPurchaseMinor(row?.min_purchase_minor);
  };
}
