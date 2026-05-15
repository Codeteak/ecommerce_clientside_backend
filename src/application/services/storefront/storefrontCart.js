import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

const BUNDLE_REWARD_ID_SUFFIX = ":bundle-reward";

function parseBillableCartQuantity(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function assertWritableCartItemId(itemId) {
  if (String(itemId).includes(BUNDLE_REWARD_ID_SUFFIX)) {
    throw new ValidationError(
      "Bundle reward lines are read-only; update the paid cart item quantity instead."
    );
  }
}

/**
 * Purpose: This file contains storefront cart business logic.
 * It resolves the active cart for guest or customer users, validates
 * item operations, and delegates cart reads/writes to the repository.
 */
export function createStorefrontCart({ cartRepo, ensureShopForCatalog, priceStorefrontLines }) {
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
      const { shopId, cart, key: customerId } = await resolveCart(client, shopIdRaw, scope);
      const items = await cartRepo.listCartItems(client, shopId, cart.id);

      if (!priceStorefrontLines || !items.length) {
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
      }

      const priced = await priceStorefrontLines(client, {
        shopId,
        customerId,
        lines: items
          .filter((it) => it.product_id && !it.is_custom)
          .map((it) => ({
            cartItemId: it.id,
            productId: String(it.product_id),
            quantity: parseBillableCartQuantity(it.quantity),
            listMinor: it.list_price_minor_per_unit ?? it.unit_price_minor,
            offerMinor: it.offer_price_minor_per_unit,
            categoryId: it.global_category_id ?? null
          }))
      });

      const pricedByCartItem = new Map(
        priced.lines.filter((l) => l.cartItemId).map((l) => [String(l.cartItemId), l])
      );

      /** @type {typeof items} */
      const cartItems = [];

      for (const it of items) {
        const p = pricedByCartItem.get(String(it.id));
        if (!p) {
          cartItems.push(it);
          continue;
        }

        const billableQty = parseBillableCartQuantity(it.quantity);
        const paidQty = p.paid_quantity ?? billableQty;
        const freeQty = p.free_quantity ?? 0;
        const displayQty = p.display_quantity ?? paidQty + freeQty;
        const bundlePromotionIds = Array.isArray(p.applied_promotion_ids) ? p.applied_promotion_ids : [];

        cartItems.push({
          ...it,
          quantity: String(billableQty),
          billable_quantity: billableQty,
          paid_quantity: paidQty,
          free_quantity: 0,
          display_quantity: displayQty,
          quantity_in_cart: it.quantity,
          is_bundle_reward: false,
          list_price_minor: p.list_price_minor,
          final_price_minor: p.final_price_minor,
          line_total_minor: p.line_total_minor,
          offer_discount_minor: p.offer_discount_minor,
          promo_discount_minor: p.promo_discount_minor,
          total_discount_minor: p.total_discount_minor,
          applied_promotion_ids: bundlePromotionIds
        });

        if (freeQty > 0) {
          cartItems.push({
            ...it,
            id: `${String(it.id)}:bundle-reward`,
            quantity: String(freeQty),
            paid_quantity: 0,
            free_quantity: freeQty,
            display_quantity: freeQty,
            quantity_in_cart: "0",
            is_bundle_reward: true,
            bundle_source_cart_item_id: it.id,
            list_price_minor: "0",
            final_price_minor: "0",
            line_total_minor: "0",
            offer_discount_minor: "0",
            promo_discount_minor: "0",
            total_discount_minor: "0",
            applied_promotion_ids: bundlePromotionIds
          });
        }
      }

      const displayUnitsTotal = cartItems.reduce(
        (sum, it) => sum + Number(it.quantity ?? 0),
        0
      );

      return {
        cartId: cart.id,
        items: cartItems,
        summary: {
          subtotal_minor: priced.subtotalMinor,
          display_units_total: displayUnitsTotal,
          promotion_discount_minor: priced.promotionDiscountTotalMinor,
          line_promo_discount_minor: priced.linePromoDiscountMinor,
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
      assertWritableCartItemId(itemId);
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
      assertWritableCartItemId(itemId);
      const { shopId, cart } = await resolveCart(client, shopIdRaw, scope);
      const hit = await cartRepo.findCartItemWithCart(client, shopId, itemId);
      if (!hit || hit.cart_id !== cart.id) {
        throw new NotFoundError("Cart item not found");
      }
      await cartRepo.deleteCartItem(client, shopId, itemId);
    }
  };
}
