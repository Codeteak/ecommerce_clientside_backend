import crypto from "node:crypto";
import { env } from "../../../config/env.js";
import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";
import { CART_SESSION_COOKIE } from "../../../application/services/storefront/storefrontCart.js";
/**
 * Purpose: This file handles storefront cart HTTP endpoints.
 * It manages guest/customer cart scope from cookies and auth,
 * then calls cart services and sends JSON HTTP responses.
 */
const CART_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 24 * 60 * 60 * 1000
};

export const storefrontCartController = {
  getOrCreate: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      let sessionId = req.cookies?.[CART_SESSION_COOKIE];
      if (!req.customerAuth?.customerId) {
        if (!sessionId || typeof sessionId !== "string") {
          sessionId = crypto.randomUUID();
          res.cookie(CART_SESSION_COOKIE, sessionId, CART_COOKIE_OPTS);
        }
      }
      const scope =
        req.customerAuth?.customerId != null
          ? { customerId: req.customerAuth.customerId }
          : { sessionId };
      const out = await withClient((c) => ctx.storefrontCart.createOrGetCart(c, shopId, scope));
      res.json(out);
    } catch (err) {
      next(err);
    }
  },

  get: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      let sessionId = req.cookies?.[CART_SESSION_COOKIE];
      if (!req.customerAuth?.customerId) {
        if (!sessionId || typeof sessionId !== "string") {
          sessionId = crypto.randomUUID();
          res.cookie(CART_SESSION_COOKIE, sessionId, CART_COOKIE_OPTS);
        }
      }
      const scope =
        req.customerAuth?.customerId != null
          ? { customerId: req.customerAuth.customerId }
          : { sessionId };
      const out = await withClient((c) => ctx.storefrontCart.getCartContents(c, shopId, scope));
      res.json(out);
    } catch (err) {
      next(err);
    }
  },

  addItem: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      let sessionId = req.cookies?.[CART_SESSION_COOKIE];
      if (!req.customerAuth?.customerId) {
        if (!sessionId || typeof sessionId !== "string") {
          sessionId = crypto.randomUUID();
          res.cookie(CART_SESSION_COOKIE, sessionId, CART_COOKIE_OPTS);
        }
      }
      const scope =
        req.customerAuth?.customerId != null
          ? { customerId: req.customerAuth.customerId }
          : { sessionId };
      const row = await withClient((c) => ctx.storefrontCart.addItem(c, shopId, scope, req.body));
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },

  patchItem: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const sessionId = req.cookies?.[CART_SESSION_COOKIE];
      const scope =
        req.customerAuth?.customerId != null
          ? { customerId: req.customerAuth.customerId }
          : { sessionId };
      if (!req.customerAuth?.customerId && !sessionId) {
        return res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Missing cart session" }
        });
      }
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
      const sessionId = req.cookies?.[CART_SESSION_COOKIE];
      const scope =
        req.customerAuth?.customerId != null
          ? { customerId: req.customerAuth.customerId }
          : { sessionId };
      if (!req.customerAuth?.customerId && !sessionId) {
        return res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Missing cart session" }
        });
      }
      await withClient((c) => ctx.storefrontCart.removeItem(c, shopId, scope, req.params.itemId));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
};
