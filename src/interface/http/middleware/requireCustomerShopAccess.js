import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { shopAllowsCustomers } from "../../../application/services/auth/shopPolicy.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";
import { withClient } from "../../../infra/db/tx.js";

/**
 * Purpose: Guard customer routes with authenticated, active membership
 * to the resolved shop context, and ensure the shop accepts customers.
 *
 * @param {{
 *   authRepo: import("../../../application/ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo
 * }} deps
 */
export function createRequireCustomerShopAccess({ authRepo }) {
  /** @type {import("express").RequestHandler} */
  return async function requireCustomerShopAccess(req, res, next) {
    try {
      const shopId = requireShopId(req.shopId);
      const customerId = req.customerAuth?.customerId;
      if (!customerId) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Customer authentication required"
          }
        });
      }

      await withClient(async (client) => {
        const bundle = await authRepo.getMembershipWithShopForCustomer(client, customerId, shopId);
        if (!bundle) {
          throw new ForbiddenError("No access to this shop");
        }
        const { membership, shop } = bundle;
        if (!membership.is_active || membership.is_blocked || membership.is_deleted) {
          throw new ForbiddenError("No access to this shop");
        }
        if (!shopAllowsCustomers(shop)) {
          throw new ForbiddenError("This shop is not available right now.");
        }
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}
