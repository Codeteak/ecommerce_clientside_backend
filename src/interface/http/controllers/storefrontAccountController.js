import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient, withTx } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";

/**
 * Purpose: This file handles storefront account HTTP endpoints.
 * It verifies customer access to the shop and manages profile
 * and address read/write operations through service and repo calls.
 */

function postProfileHandler(ctx) {
  return asyncHandler(async (req, res) => {
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
  });
}

function getAddressHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
    const profile = await withClient((c) => ctx.authRepo.getCustomerProfileByCustomerId(c, customerId));
    res.json({ address: profile?.address ?? null });
  });
}

function postAddressHandler(ctx) {
  return asyncHandler(async (req, res) => {
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
  });
}

function patchAddressHandler(ctx) {
  return asyncHandler(async (req, res) => {
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
  });
}

function requestPhoneChangeOtpHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { userId, customerId } = req.customerAuth;
    await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
    const out = await withTx((c) =>
      ctx.requestPhoneChangeOtp(c, {
        userId,
        customerId,
        shopId,
        newPhone: req.body.newPhone
      })
    );
    res.json(out);
  });
}

function verifyPhoneChangeOtpHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { userId, customerId } = req.customerAuth;
    await withClient((c) => ctx.assertCustomerShopAccess(c, shopId, customerId));
    const out = await withTx((c) =>
      ctx.verifyPhoneChangeOtp(c, {
        userId,
        customerId,
        shopId,
        newPhone: req.body.newPhone,
        code: req.body.code,
        ip: req.ip,
        userAgent: req.get("user-agent") || null
      })
    );
    res.json(out);
  });
}

export const storefrontAccountController = {
  postProfile: (ctx) => postProfileHandler(ctx),
  getAddress: (ctx) => getAddressHandler(ctx),
  postAddress: (ctx) => postAddressHandler(ctx),
  patchAddress: (ctx) => patchAddressHandler(ctx),
  requestPhoneChangeOtp: (ctx) => requestPhoneChangeOtpHandler(ctx),
  verifyPhoneChangeOtp: (ctx) => verifyPhoneChangeOtpHandler(ctx),

  forCtx(ctx) {
    return {
      postProfile: postProfileHandler(ctx),
      getAddress: getAddressHandler(ctx),
      postAddress: postAddressHandler(ctx),
      patchAddress: patchAddressHandler(ctx),
      requestPhoneChangeOtp: requestPhoneChangeOtpHandler(ctx),
      verifyPhoneChangeOtp: verifyPhoneChangeOtpHandler(ctx)
    };
  }
};
