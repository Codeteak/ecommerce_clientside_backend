import { AuthError } from "../../../domain/errors/AuthError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { shopAllowsCustomers } from "./shopPolicy.js";

const SHOP_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Purpose: After Google login, connect that person to one shop in our normal tables.
 * Creates or updates user (password can be empty), customer, and shop membership.
 */
export function provisionCustomerForOAuthShop({ authRepo }) {
  return async function execute(client, input) {
    const { shopId, email, displayName } = input;

    if (!SHOP_ID_RE.test(shopId)) {
      throw new ValidationError("Invalid shopId");
    }

    const shop = await authRepo.getShopById(client, shopId);
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    const existing = await authRepo.getUserByEmail(client, email);

    if (!existing) {
      const user = await authRepo.insertUser(client, {
        email,
        password_hash: null,
        registration_source: "google"
      });
      const customer = await authRepo.insertCustomer(client, {
        user_id: user.id,
        display_name: displayName ?? null
      });
      await authRepo.insertMembership(client, {
        shop_id: shop.id,
        customer_id: customer.id
      });
      return;
    }

    if (!existing.is_active) {
      throw new AuthError("Invalid credentials");
    }

    let customer = await authRepo.getCustomerByUserId(client, existing.id);
    if (!customer) {
      customer = await authRepo.insertCustomer(client, {
        user_id: existing.id,
        display_name: displayName ?? null
      });
    } else if (customer.is_blocked || customer.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    const membership = await authRepo.getMembershipByCustomerAndShop(client, customer.id, shop.id);

    if (membership) {
      if (membership.is_blocked) {
        throw new AuthError("Invalid credentials");
      }
      if (membership.is_active && !membership.is_deleted) {
        return;
      }
      await authRepo.reactivateMembership(client, membership.id);
    } else {
      await authRepo.insertMembership(client, {
        shop_id: shop.id,
        customer_id: customer.id
      });
    }
  };
}
