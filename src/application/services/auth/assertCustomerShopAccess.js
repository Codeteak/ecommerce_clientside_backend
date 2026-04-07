import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

/**
 * @param {{ authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo }} deps
 */
export function createAssertCustomerShopAccess({ authRepo }) {
  /** @param {import("pg").PoolClient} client @param {string} shopId @param {string} customerId */
  return async function assertCustomerShopAccess(client, shopId, customerId) {
    const m = await authRepo.getMembershipByCustomerAndShop(client, customerId, shopId);
    if (!m?.is_active || m.is_blocked || m.is_deleted) {
      throw new ForbiddenError("No access to this shop");
    }
  };
}
