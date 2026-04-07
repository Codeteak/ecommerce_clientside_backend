import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

/**
 * Purpose: This file contains storefront cart business logic.
 * It resolves the active cart for guest or customer users, validates
 * item operations, and delegates cart reads/writes to the repository.
 */
export const CART_SESSION_COOKIE = "cart_session_id";

export function createStorefrontCart({ cartRepo, ensureShopForCatalog }) {
  function guestKeyFromSession(sessionId) {
    return `guest:${String(sessionId).trim()}`;
  }

  async function resolveCart(client, shopIdRaw, scope) {
    const shopId = requireShopId(shopIdRaw);
    await ensureShopForCatalog(shopId);

    const customerId = scope.customerId != null ? String(scope.customerId).trim() : "";
    const sessionId = scope.sessionId != null ? String(scope.sessionId).trim() : "";

    if (customerId) {
      let cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, customerId);
      if (!cart) {
        cart = await cartRepo.insertCart(client, shopId, customerId);
      }
      return { shopId, cart, key: customerId };
    }

    if (!sessionId) {
      throw new ValidationError("cart session required");
    }

    const gKey = guestKeyFromSession(sessionId);
    let cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, gKey);
    if (!cart) {
      cart = await cartRepo.insertCart(client, shopId, gKey);
    }
    return { shopId, cart, key: gKey };
  }

  return {
    async createOrGetCart(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      return { cartId: cart.id, shopId };
    },

    async getCartContents(client, shopIdRaw, scope) {
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const items = await cartRepo.listCartItems(client, shopId, cart.id);
      return { cartId: cart.id, items };
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
