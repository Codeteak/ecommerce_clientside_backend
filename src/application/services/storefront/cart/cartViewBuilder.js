import {
  formatStorefrontCartItem,
  formatStorefrontPromotions,
  formatStorefrontSummary
} from "../formatStorefrontCartResponse.js";
import { parseBillableCartQuantity } from "./cartLineRules.js";

export function createCartViewBuilder({
  cartRepo,
  catalogSync,
  pricing,
  listApplicableCoupons,
  resolveCart
}) {
  const { loadSnapshotsByProductId, pruneUnsellableCartLines, syncCartLinesFromCatalog } =
    catalogSync;
  const { runPricing, buildPromotionBlock } = pricing;

  async function buildCartView(
    client,
    shopIdRaw,
    scope,
    { couponCode = null, includeSuggestedCoupons = true } = {}
  ) {
    const { shopId, cart, customerId } = await resolveCart(client, shopIdRaw, scope);
    let items = await cartRepo.listCartItems(client, shopId, cart.id);
    let mutated = false;
    let snapshots =
      items.length > 0 ? await loadSnapshotsByProductId(client, shopId, items) : new Map();

    if (items.length > 0) {
      const pruneResult = await pruneUnsellableCartLines(client, shopId, items, snapshots);
      snapshots = pruneResult.snapshots;
      if (pruneResult.removed) {
        mutated = true;
        items = await cartRepo.listCartItems(client, shopId, cart.id);
        snapshots =
          items.length > 0 ? await loadSnapshotsByProductId(client, shopId, items) : new Map();
      }
    }

    let priceMetaByItemId = new Map();
    if (items.length > 0) {
      const syncResult = await syncCartLinesFromCatalog(client, shopId, items, snapshots);
      snapshots = syncResult.snapshots;
      priceMetaByItemId = syncResult.metaByItemId;
      if (syncResult.mutated) {
        mutated = true;
      }
    }

    if (mutated) {
      items = await cartRepo.listCartItems(client, shopId, cart.id);
    }

    const pricingOut = await runPricing(client, shopId, customerId, items, couponCode);
    const priced = pricingOut?.priced ?? null;
    const couponError = pricingOut?.couponError ?? null;

    const promotionsBase = buildPromotionBlock(priced, couponCode, couponError);
    let suggested_coupons = [];

    const subtotalMinor = priced
      ? Number(priced.subtotalBeforeCouponMinor ?? priced.subtotalMinor ?? 0)
      : 0;
    const shouldLoadSuggestedCoupons =
      includeSuggestedCoupons &&
      listApplicableCoupons &&
      priced &&
      items.length > 0 &&
      subtotalMinor > 0 &&
      priced.promotionsPaused !== true;

    if (shouldLoadSuggestedCoupons) {
      const couponList = await listApplicableCoupons(client, {
        shopId,
        customerId,
        cartSubtotalMinor: subtotalMinor,
        onlyApplicable: true,
        limit: 3
      });
      suggested_coupons = (couponList.coupons ?? []).slice(0, 3).map((c) => ({
        code: c.code,
        applicable: c.eligibility?.applicable === true,
        reason_codes: c.eligibility?.ineligibilityCodes ?? []
      }));
    }

    if (!priced || !items.length) {
      const emptyItems = [];
      return {
        cart_id: cart.id,
        items: emptyItems,
        summary: formatStorefrontSummary(null, 0),
        promotions: formatStorefrontPromotions(promotionsBase, suggested_coupons, emptyItems)
      };
    }

    const pricedByCartItem = new Map(
      priced.lines.filter((l) => l.cartItemId).map((l) => [String(l.cartItemId), l])
    );

    /** @type {Array<Record<string, unknown>>} */
    const cartItems = [];

    for (const it of items) {
      const p = pricedByCartItem.get(String(it.id));
      const syncMeta = priceMetaByItemId.get(String(it.id));

      if (!p) {
        const row = formatStorefrontCartItem(it, undefined);
        if (syncMeta?.priceUpdated) {
          row.price_updated = true;
          row.previous_list_minor =
            syncMeta.previousUnitPriceMinor != null
              ? String(syncMeta.previousUnitPriceMinor)
              : null;
        }
        cartItems.push(row);
        continue;
      }

      const billableQty = parseBillableCartQuantity(it.quantity);
      const offerQty = p.free_quantity ?? 0;
      const bundlePromotionIds = Array.isArray(p.applied_promotion_ids) ? p.applied_promotion_ids : [];

      const lineSource = {
        ...it,
        billable_quantity: billableQty,
        free_quantity: offerQty,
        list_price_minor: p.list_price_minor,
        final_price_minor: p.final_price_minor,
        line_total_minor: p.line_total_minor,
        offer_discount_minor: p.offer_discount_minor,
        promo_discount_minor: p.promo_discount_minor,
        applied_promotion_ids: bundlePromotionIds
      };
      if (syncMeta?.priceUpdated) {
        lineSource.price_updated = true;
        lineSource.previous_unit_price_minor = syncMeta.previousUnitPriceMinor;
      }

      cartItems.push(formatStorefrontCartItem(lineSource, p));
    }

    const displayUnitsTotal = cartItems.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0) + Number(row.offer_quantity ?? 0),
      0
    );

    const promotions = formatStorefrontPromotions(
      promotionsBase,
      suggested_coupons,
      cartItems
    );

    return {
      cart_id: cart.id,
      items: cartItems,
      summary: formatStorefrontSummary(priced, displayUnitsTotal),
      promotions
    };
  }

  return { buildCartView };
}
