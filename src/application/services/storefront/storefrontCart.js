import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { createCartCatalogSync } from "./cart/cartCatalogSync.js";
import { createCartPricing } from "./cart/cartPricing.js";
import { createCartViewBuilder } from "./cart/cartViewBuilder.js";
import {
  assertLineQuantity,
  assertSellableProductSnapshot,
  assertWritableCartItemId,
  cartError,
  resolveRequestedQuantity
} from "./cart/cartLineRules.js";

/**
 * Purpose: Storefront cart business logic with live product checks, pricing, and coupon hints.
 */
export function createStorefrontCart({
  cartRepo,
  ensureShopForCatalog,
  priceStorefrontLines,
  listApplicableCoupons
}) {
  const catalogSync = createCartCatalogSync({ cartRepo });
  const pricing = createCartPricing({ priceStorefrontLines });

  async function resolveCart(client, shopIdRaw, scope) {
    const shopId = requireShopId(shopIdRaw);
    await ensureShopForCatalog(shopId);

    const customerId = scope.customerId != null ? String(scope.customerId).trim() : "";
    if (!customerId) {
      throw new ValidationError("customer auth required");
    }

    let cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, customerId);
    if (!cart) {
      try {
        cart = await cartRepo.insertCart(client, shopId, customerId);
      } catch (err) {
        if (err?.code === "23505") {
          cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, customerId);
        }
        if (!cart) {
          throw err;
        }
      }
    }
    return { shopId, cart, customerId };
  }

  const { buildCartView } = createCartViewBuilder({
    cartRepo,
    catalogSync,
    pricing,
    listApplicableCoupons,
    resolveCart
  });

  return {
    async createOrGetCart(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      return { cartId: cart.id, shopId };
    },

    async getCartContents(client, shopIdRaw, scope, options = {}) {
      const includeSuggestedCoupons =
        options.includeSuggestedCoupons !== false &&
        options.includeSuggestedCoupons !== "0" &&
        options.includeSuggestedCoupons !== "false";
      return buildCartView(client, shopIdRaw, scope, {
        couponCode: options.couponCode ?? null,
        includeSuggestedCoupons
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

      const snapRows = await cartRepo.listProductSnapshotsForCart(client, shopId, [productId]);
      const p = snapRows[0] ?? null;
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
        const snapRows = await cartRepo.listProductSnapshotsForCart(client, shopId, [hit.product_id]);
        const p = snapRows[0] ?? null;
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
