import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

/**
 * Purpose: This file contains storefront cart business logic.
 * It resolves the active cart for guest or customer users, validates
 * item operations, and delegates cart reads/writes to the repository.
 */
export function createStorefrontCart({ cartRepo, ensureShopForCatalog }) {
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
    return { shopId, cart, key: customerId };
  }

  return {
    async createOrGetCart(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      return { cartId: cart.id, shopId };
    },

    async getCartContents(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const items = await cartRepo.listCartItems(client, shopId, cart.id);
      let totalPriceMinor = 0;
      let totalOfferPriceMinor = 0;
      for (const it of items) {
        const qty = Number(it.quantity);
        const unitPrice = Number(it.unit_price_minor);
        const offerRaw = it.offer_price_minor_per_unit;
        const offerUnit = offerRaw == null ? unitPrice : Number(offerRaw);
        totalPriceMinor += Math.round(qty * unitPrice);
        totalOfferPriceMinor += Math.round(qty * offerUnit);
      }
      return {
        cartId: cart.id,
        items,
        summary: {
          total_price_minor: totalPriceMinor,
          total_offer_price_minor: totalOfferPriceMinor,
          total_discount_minor: Math.max(0, totalPriceMinor - totalOfferPriceMinor),
          currency: "INR"
        }
      };
    },

    async addItem(client, shopIdRaw, scope, { productId, quantity }) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const q = Number(quantity);
      if (!Number.isFinite(q) || q <= 0) {
        throw new ValidationError("quantity must be positive");
      }
      const p = await cartRepo.getProductSnapshotForCart(client, shopId, productId);
      if (!p) {
        throw new NotFoundError("Product not found");
      }
      const existing = await cartRepo.findMatchingCartItem(
        client,
        shopId,
        cart.id,
        p.id,
        false,
        null
      );
      if (existing) {
        const mergedQty = Number(existing.quantity) + q;
        return cartRepo.updateCartItemQuantity(client, shopId, existing.id, mergedQty);
      }
      const row = await cartRepo.insertCartItem(client, {
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
      return row;
    },

    async updateItemQuantity(client, shopIdRaw, scope, itemId, quantity) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const hit = await cartRepo.findCartItemWithCart(client, shopId, itemId);
      if (!hit || hit.cart_id !== cart.id) {
        throw new NotFoundError("Cart item not found");
      }
      const q = Number(quantity);
      if (!Number.isFinite(q) || q <= 0) {
        throw new ValidationError("quantity must be positive");
      }
      return cartRepo.updateCartItemQuantity(client, shopId, itemId, q);
    },

    async removeItem(client, shopIdRaw, scope, itemId) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const hit = await cartRepo.findCartItemWithCart(client, shopId, itemId);
      if (!hit || hit.cart_id !== cart.id) {
        throw new NotFoundError("Cart item not found");
      }
      await cartRepo.deleteCartItem(client, shopId, itemId);
    }
  };
}
