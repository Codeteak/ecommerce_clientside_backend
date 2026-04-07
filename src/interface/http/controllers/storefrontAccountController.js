import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient, withTx } from "../../../infra/db/tx.js";

/**
 * Purpose: This file handles storefront account HTTP endpoints.
 * It verifies customer access to the shop and manages profile
 * and address read/write operations through service and repo calls.
 */
export const storefrontAccountController = {
  postProfile: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { userId, customerId } = req.customerAuth;
      await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
      await withTx((c) =>
        ctx.updateStorefrontProfile(c, {
          userId,
          customerId,
          displayName: req.body.displayName,
          phone: req.body.phone
        })
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  getAddress: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { customerId } = req.customerAuth;
      await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
      const profile = await withClient((c) => ctx.authRepo.getCustomerProfileByCustomerId(c, customerId));
      res.json({ address: profile?.address ?? null });
    } catch (err) {
      next(err);
    }
  },

  postAddress: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { userId, customerId } = req.customerAuth;
      await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
      await withTx((c) =>
        ctx.authRepo.patchCustomerProfile(c, {
          customerId,
          userId,
          addressPatch: req.body
        })
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  patchAddress: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { userId, customerId } = req.customerAuth;
      await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
      await withTx((c) =>
        ctx.authRepo.patchCustomerProfile(c, {
          customerId,
          userId,
          addressPatch: req.body
        })
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
};
