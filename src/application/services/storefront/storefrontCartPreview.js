import { randomUUID } from "node:crypto";
import { requireShopId } from "../catalog/catalogShopId.js";
import {
  formatStorefrontCartItem,
  formatStorefrontPromotions,
  formatStorefrontSummary
} from "./formatStorefrontCartResponse.js";
import { parseBillableCartQuantity } from "./cart/cartLineRules.js";
import { collectNormalizedCouponCodes } from "../promotions/priceStorefrontLines.js";
import { rankSuggestedCouponsByDiscount } from "../promotions/rankSuggestedCoupons.js";

/**
 * Stateless cart preview from client lines (no Redis cart). Supports guest (customerId null).
 *
 * @param {{
 *   cartRepo: import("../../ports/repositories/CartRepo.js").CartRepo,
 *   ensureShopForCatalog: (shopId: string) => Promise<unknown>,
 *   priceStorefrontLines: Function,
 *   listApplicableCoupons: Function,
 *   pricing: ReturnType<import("./cart/cartPricing.js").createCartPricing>
 * }} deps
 */
export function createStorefrontCartPreview({
  cartRepo,
  ensureShopForCatalog,
  priceStorefrontLines,
  listApplicableCoupons,
  pricing
}) {
  const { buildPromotionBlock } = pricing;

  /**
   * @param {import("pg").PoolClient} client
   * @param {string} shopIdRaw
   * @param {{ customerId?: string | null }} scope
   * @param {{
   *   items?: Array<{ productId: string, quantity: number }>,
   *   couponCode?: string | null,
   *   couponCodes?: string[] | null,
   *   includeSuggestedCoupons?: boolean
   * }} body
   */
  return async function previewCartContents(client, shopIdRaw, scope, body = {}) {
    const shopId = requireShopId(shopIdRaw);
    await ensureShopForCatalog(shopId);

    const customerId =
      scope?.customerId != null && String(scope.customerId).trim()
        ? String(scope.customerId).trim()
        : null;

    const includeSuggestedCoupons =
      body.includeSuggestedCoupons !== false &&
      body.includeSuggestedCoupons !== "0" &&
      body.includeSuggestedCoupons !== "false";

    const requestedCodes = collectNormalizedCouponCodes(body);
    const primaryCouponCode = requestedCodes[0] ?? null;

    const qtyByProduct = new Map();
    for (const raw of Array.isArray(body.items) ? body.items : []) {
      const productId = String(raw?.productId ?? raw?.product_id ?? "").trim();
      const quantity = Number(raw?.quantity);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
      qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + quantity);
    }

    if (!qtyByProduct.size) {
      const emptyItems = [];
      return {
        cart_id: null,
        items: emptyItems,
        summary: formatStorefrontSummary(null, 0),
        promotions: formatStorefrontPromotions(
          buildPromotionBlock(null, primaryCouponCode, null),
          [],
          emptyItems
        )
      };
    }

    const productIds = [...qtyByProduct.keys()];
    const liveRows = await cartRepo.listLiveProductPricingByIds(client, shopId, productIds);
    const liveById = new Map(liveRows.map((r) => [String(r.id), r]));

    // Build synthetic cart lines + enrich via the same path as session carts when possible.
    /** @type {Array<Record<string, unknown>>} */
    const syntheticItems = [];
    for (const productId of productIds) {
      const live = liveById.get(productId);
      if (!live) continue;
      syntheticItems.push({
        id: randomUUID(),
        cart_id: null,
        shop_id: shopId,
        product_id: productId,
        title_snapshot: live.name ?? null,
        quantity: String(qtyByProduct.get(productId)),
        unit_size_snapshot: String(live.unit_size ?? "1"),
        unit_label: live.base_unit ?? null,
        unit_price_minor: Number(live.price_minor_per_unit),
        is_custom: false,
        custom_note: null
      });
    }

    let items = await cartRepo.enrichCartItemsForPreview(client, shopId, syntheticItems);
    // Drop lines that did not resolve to a catalog product.
    items = items.filter((it) => it.product_id && it.list_price_minor_per_unit != null);

    if (!items.length) {
      const emptyItems = [];
      return {
        cart_id: null,
        items: emptyItems,
        summary: formatStorefrontSummary(null, 0),
        promotions: formatStorefrontPromotions(
          buildPromotionBlock(null, primaryCouponCode, null),
          [],
          emptyItems
        )
      };
    }

    const billableLines = items.map((it) => ({
      cartItemId: it.id,
      productId: String(it.product_id),
      quantity: parseBillableCartQuantity(it.quantity),
      listMinor: it.list_price_minor_per_unit ?? it.unit_price_minor,
      offerMinor: it.offer_price_minor_per_unit,
      categoryId: it.global_category_id ?? null
    }));

    const priced = await priceStorefrontLines(client, {
      shopId,
      customerId,
      couponCode: primaryCouponCode,
      couponCodes: requestedCodes.length > 1 ? requestedCodes : undefined,
      lines: billableLines,
      ...(requestedCodes.length ? { invalidCouponBehavior: "omit" } : {})
    });

    let couponError = null;
    if (priced?.couponRejected) {
      couponError = {
        code: priced.couponRejected.code,
        message: priced.couponRejected.message
      };
    }

    const promotionsBase = buildPromotionBlock(priced, primaryCouponCode, couponError);
    // Surface multi-applied codes on coupon block when present.
    if (priced?.couponCodesNormalized?.length > 1) {
      promotionsBase.coupon = {
        ...promotionsBase.coupon,
        codes: priced.couponCodesNormalized,
        status: "applied",
        discount_minor: Number(priced.couponDiscountMinor ?? 0)
      };
    }

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
        limit: 20
      });
      const ruleLines = billableLines.map((l) => ({
        lineTotalMinor: Math.round(
          Number(l.listMinor ?? 0) * Number(l.quantity ?? 0)
        ),
        categoryId: l.categoryId
      }));
      // Prefer priced line totals when available.
      const pricedRuleLines =
        Array.isArray(priced.lines) && priced.lines.length
          ? items.map((it) => {
              const p = priced.lines.find((l) => String(l.cartItemId) === String(it.id));
              return {
                lineTotalMinor: p
                  ? Number(p.line_total_minor)
                  : Math.round(Number(it.unit_price_minor) * Number(it.quantity)),
                categoryId: it.global_category_id ?? null
              };
            })
          : ruleLines;

      suggested_coupons = rankSuggestedCouponsByDiscount(
        couponList.coupons ?? [],
        { subtotalMinor, lines: pricedRuleLines },
        3
      );
    }

    const pricedByCartItem = new Map(
      (priced?.lines ?? []).filter((l) => l.cartItemId).map((l) => [String(l.cartItemId), l])
    );

    /** @type {Array<Record<string, unknown>>} */
    const cartItems = [];
    for (const it of items) {
      const p = pricedByCartItem.get(String(it.id));
      if (!p) {
        cartItems.push(formatStorefrontCartItem(it, undefined));
        continue;
      }
      const billableQty = parseBillableCartQuantity(it.quantity);
      const offerQty = p.free_quantity ?? 0;
      const bundlePromotionIds = Array.isArray(p.applied_promotion_ids) ? p.applied_promotion_ids : [];
      cartItems.push(
        formatStorefrontCartItem(
          {
            ...it,
            billable_quantity: billableQty,
            free_quantity: offerQty,
            list_price_minor: p.list_price_minor,
            final_price_minor: p.final_price_minor,
            line_total_minor: p.line_total_minor,
            offer_discount_minor: p.offer_discount_minor,
            promo_discount_minor: p.promo_discount_minor,
            applied_promotion_ids: bundlePromotionIds
          },
          p
        )
      );
    }

    const displayUnitsTotal = cartItems.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0) + Number(row.offer_quantity ?? 0),
      0
    );

    return {
      cart_id: null,
      items: cartItems,
      summary: formatStorefrontSummary(priced, displayUnitsTotal),
      promotions: formatStorefrontPromotions(promotionsBase, suggested_coupons, cartItems)
    };
  };
}
