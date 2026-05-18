import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { AppError } from "../../../domain/errors/AppError.js";
import {
  formatStorefrontCartItem,
  formatStorefrontPromotions,
  formatStorefrontSummary
} from "./formatStorefrontCartResponse.js";

const BUNDLE_REWARD_ID_SUFFIX = ":bundle-reward";
const MAX_LINE_QUANTITY = 99;

function parseBillableCartQuantity(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function cartError(code, message, statusCode = 400) {
  return new AppError(message, { statusCode, code });
}

function assertLineQuantity(qty) {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError("quantity must be positive");
  }
  if (qty > MAX_LINE_QUANTITY) {
    throw cartError(
      "LINE_QUANTITY_CAP",
      `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`
    );
  }
}

function assertSellableProductSnapshot(product) {
  if (!product) {
    throw cartError(
      "PRODUCT_UNAVAILABLE",
      "One or more products are unavailable. Please refresh your cart."
    );
  }
}

/** @returns {string | null} removal reason code when line cannot be sold as stored */
function cartLineRemovalReason(product, quantityRaw) {
  if (!product) return "PRODUCT_UNAVAILABLE";
  const qty = parseBillableCartQuantity(quantityRaw);
  if (qty <= 0) return "INVALID_QUANTITY";
  if (qty > MAX_LINE_QUANTITY) return "LINE_QUANTITY_CAP";
  return null;
}

function assertWritableCartItemId(itemId) {
  if (String(itemId).includes(BUNDLE_REWARD_ID_SUFFIX)) {
    throw new ValidationError(
      "Bundle reward lines are read-only; update the paid cart item quantity instead."
    );
  }
}

/**
 * @param {{ quantity?: unknown, delta?: unknown }} body
 * @param {number | null} currentQty
 */
function resolveRequestedQuantity(body, currentQty = null) {
  const hasDelta = body?.delta !== undefined && body?.delta !== null && body?.delta !== "";
  const hasQty = body?.quantity !== undefined && body?.quantity !== null && body?.quantity !== "";

  if (hasDelta) {
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      throw new ValidationError("delta must be an integer");
    }
    if (currentQty == null) {
      if (delta <= 0) {
        throw new ValidationError("delta must be positive when adding a new line");
      }
      return delta;
    }
    return Number(currentQty) + delta;
  }

  if (hasQty) {
    return Number(body.quantity);
  }

  throw new ValidationError("quantity or delta is required");
}

function mapCouponReasonMessage(code) {
  const messages = {
    MIN_SUBTOTAL_NOT_MET: "Cart subtotal does not meet the minimum for this coupon.",
    FIRST_ORDER_ONLY_NOT_MET: "This coupon is for first orders only.",
    NEW_CUSTOMER_ONLY_NOT_MET: "This coupon is for new customers only.",
    COUPON_NOT_FOUND: "Coupon not found.",
    COUPON_EXHAUSTED: "This coupon has reached its redemption limit.",
    COUPON_NOT_APPLICABLE: "Coupon cannot be applied to this cart.",
    EMPTY_CART_WITH_COUPON: "Cannot apply a coupon to an empty cart."
  };
  return messages[code] ?? "Coupon cannot be applied to this cart.";
}

/**
 * Purpose: Storefront cart business logic with live product checks, pricing, and coupon hints.
 */
export function createStorefrontCart({
  cartRepo,
  ensureShopForCatalog,
  priceStorefrontLines,
  listApplicableCoupons
}) {
  async function resolveCart(client, shopIdRaw, scope) {
    const shopId = requireShopId(shopIdRaw);
    await ensureShopForCatalog(shopId);

    const customerId = scope.customerId != null ? String(scope.customerId).trim() : "";
    if (!customerId) {
      throw new ValidationError("customer auth required");
    }

    let cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, customerId);
    if (!cart) {
      cart = await cartRepo.insertCart(client, shopId, customerId);
    }
    return { shopId, cart, customerId };
  }

  /**
   * On read (GET cart), drop lines that cannot be sold so the client always gets 200 + valid cart.
   * Add/update still fail fast with the same error codes.
   */
  async function pruneUnsellableCartLines(client, shopId, items) {
    let removed = false;

    for (const it of items) {
      if (it.is_custom || !it.product_id) continue;

      const p = await cartRepo.getProductSnapshotForCart(client, shopId, it.product_id);
      const reason = cartLineRemovalReason(p, it.quantity);
      if (reason) {
        await cartRepo.deleteCartItem(client, shopId, it.id);
        removed = true;
      }
    }

    return removed;
  }

  async function syncCartLinesFromCatalog(client, shopId, items) {
    /** @type {Map<string, { priceUpdated: boolean, previousUnitPriceMinor?: number }>} */
    const metaByItemId = new Map();

    for (const it of items) {
      if (it.is_custom || !it.product_id) continue;

      const p = await cartRepo.getProductSnapshotForCart(client, shopId, it.product_id);
      if (!p) {
        throw cartError(
          "PRODUCT_UNAVAILABLE",
          "One or more products are unavailable. Please refresh your cart."
        );
      }
      assertSellableProductSnapshot(p);

      const listPrice = Number(p.price_minor_per_unit);
      const prevUnit = Number(it.unit_price_minor);
      const priceUpdated = prevUnit !== listPrice;
      const qty = parseBillableCartQuantity(it.quantity);

      assertLineQuantity(qty);

      if (priceUpdated || String(it.title_snapshot) !== String(p.name)) {
        await cartRepo.updateCartItemSnapshot(client, shopId, it.id, {
          quantity: qty,
          unitPriceMinor: listPrice,
          titleSnapshot: p.name,
          unitLabel: p.base_unit
        });
      }

      metaByItemId.set(String(it.id), {
        priceUpdated,
        previousUnitPriceMinor: priceUpdated ? prevUnit : undefined
      });
    }

    return metaByItemId;
  }

  async function runPricing(client, shopId, customerId, items, couponCode) {
    if (!priceStorefrontLines) {
      return null;
    }

    const billableLines = items
      .filter((it) => it.product_id && !it.is_custom)
      .map((it) => ({
        cartItemId: it.id,
        productId: String(it.product_id),
        quantity: parseBillableCartQuantity(it.quantity),
        listMinor: it.list_price_minor_per_unit ?? it.unit_price_minor,
        offerMinor: it.offer_price_minor_per_unit,
        categoryId: it.global_category_id ?? null
      }));

    const normalizedCoupon = normalizeCouponCode(couponCode);

    try {
      const priced = await priceStorefrontLines(client, {
        shopId,
        customerId,
        couponCode: normalizedCoupon,
        lines: billableLines
      });
      return { priced, couponError: null };
    } catch (err) {
      if (!normalizedCoupon || !(err instanceof AppError)) {
        throw err;
      }
      const priced = await priceStorefrontLines(client, {
        shopId,
        customerId,
        couponCode: null,
        lines: billableLines
      });
      return {
        priced,
        couponError: {
          code: err.code || "COUPON_NOT_APPLICABLE",
          message: err.message || mapCouponReasonMessage(err.code)
        }
      };
    }
  }

  function buildPromotionBlock(priced, couponCode, couponError) {
    const normalizedCoupon = normalizeCouponCode(couponCode);

    if (!priced) {
      return {
        paused: false,
        auto: {
          applied_promotion_ids: [],
          bundle_discount_minor: 0,
          line_promo_discount_minor: 0,
          has_sku_promo: false,
          has_bundle: false
        },
        coupon: { code: normalizedCoupon, status: "none", discount_minor: 0, reason_code: null, reason_message: null },
        suggested_coupons: []
      };
    }

    const bundleDiscountMinor = Number(priced.bundleDiscountMinor ?? 0);
    const linePromoDiscountMinor = Number(priced.linePromoDiscountMinor ?? 0);

    let couponStatus = "none";
    let reasonCode = null;
    let reasonMessage = null;
    let discountMinor = 0;
    const code = normalizedCoupon;

    if (code && couponError) {
      couponStatus = "not_applicable";
      reasonCode = couponError.code;
      reasonMessage = couponError.message;
    } else if (code && priced.coupon) {
      couponStatus = "applied";
      discountMinor = Number(priced.coupon.discountMinor ?? priced.couponDiscountMinor ?? 0);
    } else if (code) {
      couponStatus = "not_applicable";
      reasonCode = "COUPON_NOT_APPLICABLE";
      reasonMessage = mapCouponReasonMessage(reasonCode);
    }

    return {
      paused: priced.promotionsPaused === true,
      auto: {
        applied_promotion_ids: Array.isArray(priced.appliedPromotionIds) ? priced.appliedPromotionIds : [],
        bundle_discount_minor: bundleDiscountMinor,
        line_promo_discount_minor: linePromoDiscountMinor,
        has_sku_promo: linePromoDiscountMinor > 0,
        has_bundle: bundleDiscountMinor > 0
      },
      coupon: {
        code,
        status: couponStatus,
        discount_minor: discountMinor,
        reason_code: reasonCode,
        reason_message: reasonMessage
      }
    };
  }

  async function buildCartView(client, shopIdRaw, scope, { couponCode = null } = {}) {
    const { shopId, cart, customerId } = await resolveCart(client, shopIdRaw, scope);
    let items = await cartRepo.listCartItems(client, shopId, cart.id);

    if (items.length > 0 && (await pruneUnsellableCartLines(client, shopId, items))) {
      items = await cartRepo.listCartItems(client, shopId, cart.id);
    }

    const priceMetaByItemId =
      items.length > 0 ? await syncCartLinesFromCatalog(client, shopId, items) : new Map();

    if (priceMetaByItemId.size) {
      items = await cartRepo.listCartItems(client, shopId, cart.id);
    }

    const { priced, couponError } = await runPricing(client, shopId, customerId, items, couponCode);

    const promotionsBase = buildPromotionBlock(priced, couponCode, couponError);
    let suggested_coupons = [];

    if (listApplicableCoupons && priced && items.length > 0) {
      const couponList = await listApplicableCoupons(client, {
        shopId,
        customerId,
        cartSubtotalMinor: priced.subtotalBeforeCouponMinor ?? priced.subtotalMinor,
        onlyApplicable: true
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

  return {
    async createOrGetCart(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      return { cartId: cart.id, shopId };
    },

    async getCartContents(client, shopIdRaw, scope, options = {}) {
      return buildCartView(client, shopIdRaw, scope, {
        couponCode: options.couponCode ?? null
      });
    },

    async addItem(client, shopIdRaw, scope, body) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const productId = body?.productId;
      if (!productId) {
        throw new ValidationError("productId is required");
      }

      const q = resolveRequestedQuantity(body, null);
      assertLineQuantity(q);

      const p = await cartRepo.getProductSnapshotForCart(client, shopId, productId);
      assertSellableProductSnapshot(p);

      const existing = await cartRepo.findMatchingCartItem(client, shopId, cart.id, p.id, false, null);
      if (existing) {
        const mergedQty = Number(existing.quantity) + q;
        assertLineQuantity(mergedQty);
        await cartRepo.updateCartItemSnapshot(client, shopId, existing.id, {
          quantity: mergedQty,
          unitPriceMinor: Number(p.price_minor_per_unit),
          titleSnapshot: p.name,
          unitLabel: p.base_unit
        });
      } else {
        await cartRepo.insertCartItem(client, {
          cartId: cart.id,
          shopId,
          productId: p.id,
          titleSnapshot: p.name,
          quantity: q,
          unitLabel: p.base_unit,
          unitPriceMinor: Number(p.price_minor_per_unit),
          isCustom: false,
          customNote: null
        });
      }

      return buildCartView(client, shopIdRaw, scope, { couponCode: body?.couponCode ?? null });
    },

    async updateItemQuantity(client, shopIdRaw, scope, itemId, body) {
      assertWritableCartItemId(itemId);
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const hit = await cartRepo.findCartItemWithCart(client, shopId, itemId);
      if (!hit || hit.cart_id !== cart.id) {
        throw new NotFoundError("Cart item not found");
      }

      const currentQty = Number(hit.quantity ?? 0);

      const hasDelta = body?.delta !== undefined && body?.delta !== null && body?.delta !== "";
      if (hasDelta && Number(body.delta) < 0 && currentQty <= 1) {
        throw cartError(
          "MINIMUM_QUANTITY",
          "Minimum quantity is 1. Remove the item to delete it from your cart."
        );
      }

      const targetQty = resolveRequestedQuantity(body, currentQty);
      assertLineQuantity(targetQty);

      if (!hit.is_custom && hit.product_id) {
        const p = await cartRepo.getProductSnapshotForCart(client, shopId, hit.product_id);
        assertSellableProductSnapshot(p);
        await cartRepo.updateCartItemSnapshot(client, shopId, itemId, {
          quantity: targetQty,
          unitPriceMinor: Number(p.price_minor_per_unit),
          titleSnapshot: p.name,
          unitLabel: p.base_unit
        });
      } else {
        await cartRepo.updateCartItemQuantity(client, shopId, itemId, targetQty);
      }

      return buildCartView(client, shopIdRaw, scope, { couponCode: body?.couponCode ?? null });
    },

    async removeItem(client, shopIdRaw, scope, itemId, body = {}) {
      assertWritableCartItemId(itemId);
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const hit = await cartRepo.findCartItemWithCart(client, shopId, itemId);
      if (!hit || hit.cart_id !== cart.id) {
        throw new NotFoundError("Cart item not found");
      }
      await cartRepo.deleteCartItem(client, shopId, itemId);
      return buildCartView(client, shopIdRaw, scope, { couponCode: body?.couponCode ?? null });
    }
  };
}
