import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";
import { assertShopAllowsCustomers } from "./shopPolicy.js";

/**
 * Same membership + shop-status gate as `requireCustomerShopAccess` middleware,
 * for controllers that assert access inside an existing transaction.
 *
 * @param {{ authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo }} deps
 */
export function createAssertCustomerShopAccess({ authRepo }) {
  /** @param {import("pg").PoolClient} client @param {string} shopId @param {string} customerId */
  return async function assertCustomerShopAccess(client, shopId, customerId) {
    const bundle = await authRepo.getMembershipWithShopForCustomer(client, customerId, shopId);
    if (!bundle) {
      throw new ForbiddenError("No access to this shop");
    }
    const { membership, shop } = bundle;
    if (!membership.is_active || membership.is_blocked || membership.is_deleted) {
      throw new ForbiddenError("No access to this shop");
    }
    assertShopAllowsCustomers(shop, { statusCode: 403 });
  };
}
