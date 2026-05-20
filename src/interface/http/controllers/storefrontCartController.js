import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withTx } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";

/**
 * Purpose: This file handles storefront cart HTTP endpoints.
 * It uses authenticated customer scope,
 * then calls cart services and sends JSON HTTP responses.
 */

function getOrCreateHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const scope = { customerId: req.customerAuth.customerId };
    const out = await withTx((c) => ctx.storefrontCart.createOrGetCart(c, shopId, scope));
    res.json(out);
  });
}

function getHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const scope = { customerId: req.customerAuth.customerId };
    const couponCode = req.query?.couponCode;
    const includeSuggestedCoupons = req.query?.includeSuggestedCoupons;
    const out = await withTx((c) =>
      ctx.storefrontCart.getCartContents(c, shopId, scope, { couponCode, includeSuggestedCoupons })
    );
    res.json(out);
  });
}

function addItemHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const scope = { customerId: req.customerAuth.customerId };
    const out = await withTx((c) => ctx.storefrontCart.addItem(c, shopId, scope, req.body));
    res.status(201).json(out);
  });
}

function patchItemHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const scope = { customerId: req.customerAuth.customerId };
    const out = await withTx((c) =>
      ctx.storefrontCart.updateItemQuantity(c, shopId, scope, req.params.itemId, req.body)
    );
    res.json(out);
  });
}

function deleteItemHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const scope = { customerId: req.customerAuth.customerId };
    const out = await withTx((c) =>
      ctx.storefrontCart.removeItem(c, shopId, scope, req.params.itemId, req.body ?? {})
    );
    res.json(out);
  });
}

export const storefrontCartController = {
  getOrCreate: (ctx) => getOrCreateHandler(ctx),
  get: (ctx) => getHandler(ctx),
  addItem: (ctx) => addItemHandler(ctx),
  patchItem: (ctx) => patchItemHandler(ctx),
  deleteItem: (ctx) => deleteItemHandler(ctx),

  forCtx(ctx) {
    return {
      getOrCreate: getOrCreateHandler(ctx),
      get: getHandler(ctx),
      addItem: addItemHandler(ctx),
      patchItem: patchItemHandler(ctx),
      deleteItem: deleteItemHandler(ctx)
    };
  }
};
