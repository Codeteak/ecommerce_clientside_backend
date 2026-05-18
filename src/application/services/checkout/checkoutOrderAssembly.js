import { checkoutError, minorFromLine, orderLineQuantitiesFromPriced } from "./checkoutInput.js";

export async function loadLiveProductPricingMap(cartRepo, client, shopId, items) {
  const productIds = [
    ...new Set(items.filter((it) => !it.is_custom && it.product_id).map((it) => String(it.product_id)))
  ];
  const liveByProduct = new Map();
  if (!productIds.length) {
    return liveByProduct;
  }
  const liveRows = await cartRepo.listLiveProductPricingByIds(client, shopId, productIds);
  for (const row of liveRows) {
    liveByProduct.set(String(row.id), row);
  }
  return liveByProduct;
}

export async function buildCheckoutOrderLines({
  cartRepo,
  client,
  shopId,
  custKey,
  items,
  couponCode,
  priceStorefrontLines
}) {
  if (couponCode && !items.length) {
    throw checkoutError("EMPTY_CART_WITH_COUPON", "Cannot apply a coupon to an empty cart.");
  }

  const liveByProduct = priceStorefrontLines
    ? await loadLiveProductPricingMap(cartRepo, client, shopId, items)
    : new Map();

  let subtotal = 0;
  let promotionDiscountTotalMinor = 0;
  let couponDiscountMinor = 0;
  let couponCodeNormalized = null;
  /** @type {string[]} */
  let appliedPromotionIds = [];
  /** @type {Array<Record<string, unknown>>} */
  let orderItems = [];
  /** @type {Awaited<ReturnType<NonNullable<typeof priceStorefrontLines>>> | null} */
  let pricedResult = null;

  if (priceStorefrontLines) {
    const priced = await priceStorefrontLines(client, {
      shopId,
      customerId: custKey,
      couponCode,
      lines: items
        .filter((it) => !it.is_custom && it.product_id)
        .map((it) => {
          const live = liveByProduct.get(String(it.product_id));
          return {
            cartItemId: it.id,
            productId: String(it.product_id),
            quantity: Number(it.quantity),
            listMinor: live?.price_minor_per_unit ?? it.unit_price_minor,
            offerMinor: live?.offer_price_minor_per_unit ?? null,
            categoryId: live?.global_category_id ?? null
          };
        })
    });
    pricedResult = priced;
    subtotal = priced.subtotalMinor;
    promotionDiscountTotalMinor = priced.promotionDiscountTotalMinor;
    couponDiscountMinor = priced.couponDiscountMinor;
    couponCodeNormalized = priced.coupon?.code ?? null;
    appliedPromotionIds = priced.appliedPromotionIds;

    const pricedByCartItem = new Map(
      priced.lines.filter((l) => l.cartItemId).map((l) => [String(l.cartItemId), l])
    );
    orderItems = items.map((it) => {
      if (it.is_custom || !it.product_id) {
        const lineTotal = minorFromLine(it.quantity, it.unit_price_minor);
        subtotal += lineTotal;
        const qty = Number(it.quantity);
        return {
          productId: it.product_id,
          name: it.title_snapshot,
          unitLabel: it.unit_label,
          quantity: qty,
          paidQuantity: qty,
          freeQuantity: 0,
          unitPriceMinor: Number(it.unit_price_minor),
          lineTotalMinor: lineTotal,
          listPriceMinor: Number(it.unit_price_minor),
          lineDiscountMinor: 0,
          appliedPromotionIds: [],
          isCustom: it.is_custom,
          customNote: it.custom_note
        };
      }
      const p = pricedByCartItem.get(String(it.id));
      const { quantity, paidQuantity, freeQuantity } = orderLineQuantitiesFromPriced(p, it.quantity);
      const unitPriceMinor = p ? Number(p.final_price_minor) : Number(it.unit_price_minor);
      const lineTotalMinor = p ? Number(p.line_total_minor) : minorFromLine(it.quantity, it.unit_price_minor);
      const listPriceMinor = p ? Number(p.list_price_minor) : Number(it.unit_price_minor);
      const compareTotal = p
        ? Math.round(Number(p.total_price_minor) * quantity)
        : lineTotalMinor;
      const lineDiscountMinor = Math.max(0, compareTotal - lineTotalMinor);
      return {
        productId: it.product_id,
        name: it.title_snapshot,
        unitLabel: it.unit_label,
        quantity,
        paidQuantity,
        freeQuantity,
        unitPriceMinor,
        lineTotalMinor,
        listPriceMinor,
        lineDiscountMinor,
        appliedPromotionIds: p?.applied_promotion_ids ?? [],
        isCustom: it.is_custom,
        customNote: it.custom_note
      };
    });
  } else {
    orderItems = items.map((it) => {
      const lineTotal = minorFromLine(it.quantity, it.unit_price_minor);
      subtotal += lineTotal;
      const qty = Number(it.quantity);
      return {
        productId: it.product_id,
        name: it.title_snapshot,
        unitLabel: it.unit_label,
        quantity: qty,
        paidQuantity: qty,
        freeQuantity: 0,
        unitPriceMinor: Number(it.unit_price_minor),
        lineTotalMinor: lineTotal,
        listPriceMinor: Number(it.unit_price_minor),
        lineDiscountMinor: 0,
        appliedPromotionIds: [],
        isCustom: it.is_custom,
        customNote: it.custom_note
      };
    });
  }

  return {
    subtotal,
    promotionDiscountTotalMinor,
    couponDiscountMinor,
    couponCodeNormalized,
    appliedPromotionIds,
    orderItems,
    pricedResult
  };
}
