import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";
/**
 * Purpose: This file handles storefront cart HTTP endpoints.
 * It uses authenticated customer scope,
 * then calls cart services and sends JSON HTTP responses.
 */

export const storefrontCartController = {
  getOrCreate: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const scope = { customerId: req.customerAuth.customerId };
      const out = await withClient((c) => ctx.storefrontCart.createOrGetCart(c, shopId, scope));
      res.json(out);
    } catch (err) {
      next(err);
    }
  },

  get: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const scope = { customerId: req.customerAuth.customerId };
      const out = await withClient((c) => ctx.storefrontCart.getCartContents(c, shopId, scope));
      res.json(out);
    } catch (err) {
      next(err);
    }
  },

  addItem: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const scope = { customerId: req.customerAuth.customerId };
      const row = await withClient((c) => ctx.storefrontCart.addItem(c, shopId, scope, req.body));
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },

  patchItem: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const scope = { customerId: req.customerAuth.customerId };
      const row = await withClient((c) =>
        ctx.storefrontCart.updateItemQuantity(c, shopId, scope, req.params.itemId, req.body.quantity)
      );
      res.json(row);
    } catch (err) {
      next(err);
    }
  },

  deleteItem: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const scope = { customerId: req.customerAuth.customerId };
      await withClient((c) => ctx.storefrontCart.removeItem(c, shopId, scope, req.params.itemId));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
};
