import { checkoutError, minorFromLine, orderLineQuantitiesFromPriced } from "./checkoutInput.js";

function unitSizeSnapshotFromCartLine(it) {
  return String(it.unit_size_snapshot ?? "1");
}

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
  couponCodes,
  priceStorefrontLines
}) {
  const hasCouponRequest =
    (typeof couponCode === "string" && couponCode.trim()) ||
    (Array.isArray(couponCodes) && couponCodes.length > 0);
  if (hasCouponRequest && !items.length) {
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
  let couponCodesNormalized = [];
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
      couponCodes,
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
    couponCodeNormalized = priced.couponCodeNormalized ?? priced.coupon?.code ?? null;
    couponCodesNormalized = Array.isArray(priced.couponCodesNormalized)
      ? priced.couponCodesNormalized
      : couponCodeNormalized
        ? [couponCodeNormalized]
        : [];
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
          customNote: it.custom_note,
          unitSizeSnapshot: unitSizeSnapshotFromCartLine(it)
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
        customNote: it.custom_note,
        unitSizeSnapshot: unitSizeSnapshotFromCartLine(it)
      };
    });

    // Cross BXGY: free reward SKUs injected by pricing must become order lines.
    const knownCartIds = new Set(items.map((it) => String(it.id)));
    const injected = priced.lines.filter(
      (l) =>
        l.cartItemId &&
        String(l.cartItemId).startsWith("inject:") &&
        !knownCartIds.has(String(l.cartItemId))
    );
    if (injected.length) {
      const injectProductIds = [...new Set(injected.map((l) => String(l.productId)))];
      /** @type {Map<string, { name: string, unitLabel: string | null }>} */
      const nameById = new Map();
      try {
        const { rows } = await client.query(
          `SELECT sp.id,
                  COALESCE(sp.name, gp.name) AS name,
                  COALESCE(sp.unit_label, gp.unit_label) AS unit_label
             FROM shop_products sp
             LEFT JOIN global_products gp ON gp.id = sp.global_product_id
            WHERE sp.shop_id = $1::uuid
              AND sp.id = ANY($2::uuid[])`,
          [shopId, injectProductIds]
        );
        for (const row of rows) {
          nameById.set(String(row.id), {
            name: String(row.name || "").trim() || `Product ${String(row.id).slice(0, 8)}`,
            unitLabel: row.unit_label != null ? String(row.unit_label) : null
          });
        }
      } catch {
        try {
          const { rows } = await client.query(
            `SELECT sp.id, COALESCE(sp.name, gp.name) AS name
               FROM shop_products sp
               LEFT JOIN global_products gp ON gp.id = sp.global_product_id
              WHERE sp.shop_id = $1::uuid
                AND sp.id = ANY($2::uuid[])`,
            [shopId, injectProductIds]
          );
          for (const row of rows) {
            nameById.set(String(row.id), {
              name: String(row.name || "").trim() || `Product ${String(row.id).slice(0, 8)}`,
              unitLabel: null
            });
          }
        } catch {
          /* best-effort names */
        }
      }
      for (const p of injected) {
        const live = nameById.get(String(p.productId));
        const { quantity, paidQuantity, freeQuantity } = orderLineQuantitiesFromPriced(
          p,
          p.display_quantity ?? p.free_quantity ?? p.quantity
        );
        const unitPriceMinor = Number(p.final_price_minor);
        const lineTotalMinor = Number(p.line_total_minor);
        const listPriceMinor = Number(p.list_price_minor);
        const compareTotal = Math.round(Number(p.total_price_minor) * Math.max(1, quantity));
        orderItems.push({
          productId: p.productId,
          name: live?.name ?? `Product ${String(p.productId).slice(0, 8)}`,
          unitLabel: live?.unitLabel ?? null,
          quantity,
          paidQuantity,
          freeQuantity,
          unitPriceMinor,
          lineTotalMinor,
          listPriceMinor,
          lineDiscountMinor: Math.max(0, compareTotal - lineTotalMinor),
          appliedPromotionIds: p.applied_promotion_ids ?? [],
          isCustom: false,
          customNote: null,
          unitSizeSnapshot: "1"
        });
      }
    }
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
        customNote: it.custom_note,
        unitSizeSnapshot: unitSizeSnapshotFromCartLine(it)
      };
    });
  }

  return {
    subtotal,
    promotionDiscountTotalMinor,
    couponDiscountMinor,
    couponCodeNormalized,
    couponCodesNormalized,
    appliedPromotionIds,
    orderItems,
    pricedResult
  };
}
