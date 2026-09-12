import { requireShopId } from "../catalog/catalogShopId.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { createCartCatalogSync } from "./cart/cartCatalogSync.js";
import { createCartPricing } from "./cart/cartPricing.js";
import { createCartViewBuilder } from "./cart/cartViewBuilder.js";
import {
  formatStorefrontPromotions,
  formatStorefrontSummary
} from "./formatStorefrontCartResponse.js";

/**
 * Purpose: Storefront cart business logic — pricing/preview from client lines.
 * Server-side Redis cart mutate/get-or-create is retired (localStorage is source of truth).
 */
function retiredServerCartError() {
  return new AppError(
    "Server cart is retired. Persist cart in the client and use POST /storefront/cart/preview or checkout with items.",
    { statusCode: 410, code: "CART_SERVER_RETIRED" }
  );
}

function emptyCartView() {
  const promotionsBase = {
    paused: false,
    auto: {
      applied_promotion_ids: [],
      bundle_discount_minor: 0,
      line_promo_discount_minor: 0,
      has_sku_promo: false,
      has_bundle: false
    },
    coupon: {
      code: null,
      status: "none",
      discount_minor: 0,
      reason_code: null,
      reason_message: null
    },
    suggested_coupons: []
  };
  return {
    cart_id: null,
    items: [],
    summary: formatStorefrontSummary(null, 0),
    promotions: formatStorefrontPromotions(promotionsBase, [], [])
  };
}

export function createStorefrontCart({
  cartRepo,
  ensureShopForCatalog,
  priceStorefrontLines,
  listApplicableCoupons
}) {
  const catalogSync = createCartCatalogSync({ cartRepo });
  const pricing = createCartPricing({ priceStorefrontLines });

  async function resolveCustomerScope(client, shopIdRaw, scope) {
    const shopId = requireShopId(shopIdRaw);
    await ensureShopForCatalog(shopId);

    const customerId = scope.customerId != null ? String(scope.customerId).trim() : "";
    if (!customerId) {
      throw new ValidationError("customer auth required");
    }
    return { shopId, customerId };
  }

  const { buildCartViewFromClientItems } = createCartViewBuilder({
    cartRepo,
    catalogSync,
    pricing,
    listApplicableCoupons,
    resolveCart: async () => {
      throw retiredServerCartError();
    }
  });

  return {
    async createOrGetCart() {
      throw retiredServerCartError();
    },

    async getCartContents() {
      // Redis-backed GET is retired; clients use localStorage + POST /cart/preview.
      return emptyCartView();
    },

    /**
     * Price client cart lines (and optional coupon(s)) without reading/writing Redis.
     * Prefer storefrontCartPreview for guest-capable multi-coupon preview.
     * @param {object} body
     * @param {Array<{ productId: string, quantity: number }>} body.items
     * @param {string|null} [body.couponCode]
     * @param {string[]|null} [body.couponCodes]
     * @param {boolean|string} [body.includeSuggestedCoupons]
     */
    async previewFromClientItems(client, shopIdRaw, scope, body = {}) {
      const { shopId, customerId } = await resolveCustomerScope(client, shopIdRaw, scope);

      const includeSuggestedCoupons =
        body.includeSuggestedCoupons !== false &&
        body.includeSuggestedCoupons !== "0" &&
        body.includeSuggestedCoupons !== "false";

      const clientLines = Array.isArray(body.items) ? body.items : [];
      if (!clientLines.length) {
        return emptyCartView();
      }

      const validated = await cartRepo.validateClientLinesForCheckout(client, shopId, clientLines);
      const withShop = validated.map((it) => ({
        ...it,
        cart_id: it.cart_id ?? null,
        shop_id: shopId
      }));

      const items =
        typeof cartRepo.enrichCartItemsForView === "function"
          ? await cartRepo.enrichCartItemsForView(client, shopId, withShop)
          : withShop.map((it) => ({
              ...it,
              list_price_minor_per_unit: it.unit_price_minor,
              offer_price_minor_per_unit: null,
              global_category_id: null
            }));

      return buildCartViewFromClientItems(client, shopId, customerId, items, {
        couponCode: body.couponCode ?? null,
        couponCodes: body.couponCodes ?? null,
        includeSuggestedCoupons
      });
    },

    async addItem() {
      throw retiredServerCartError();
    },

    async updateItemQuantity() {
      throw retiredServerCartError();
    },

    async removeItem() {
      throw retiredServerCartError();
    }
  };
}
