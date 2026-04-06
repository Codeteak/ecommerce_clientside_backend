import { AuthError } from "../../../domain/errors/AuthError.js";
import { ConflictError } from "../../../domain/errors/ConflictError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { hashPassword, verifyPassword } from "../../../infra/security/passwordHasher.js";
import { signCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { shopAllowsCustomers } from "./shopPolicy.js";

/**
 * Purpose: Join a shop as a customer — new account or existing email adding this shop.
 * Returns a JWT and shop info; JWT includes shopId on success.
 */
export function registerCustomer({ authRepo }) {
  return async function execute(client, input) {
    const { shopId, email, password, displayName } = input;

    const shop = await authRepo.getShopById(client, shopId);

    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    const existing = await authRepo.getUserByEmail(client, email);

    if (!existing) {
      const password_hash = await hashPassword(password);
      const user = await authRepo.insertUser(client, { email, password_hash, registration_source: "password" });
      const customer = await authRepo.insertCustomer(client, {
        user_id: user.id,
        display_name: displayName ?? null
      });
      await authRepo.insertMembership(client, {
        shop_id: shop.id,
        customer_id: customer.id
      });

      const accessToken = signCustomerAccessToken({
        userId: user.id,
        shopId: shop.id,
        customerId: customer.id
      });

      return {
        accessToken,
        role: "customer",
        user: { id: user.id, email: user.email, registrationSource: user.registration_source },
        shop: { id: shop.id, slug: shop.slug, name: shop.name },
        customer: { id: customer.id }
      };
    }

    const passwordOk = await verifyPassword(password, existing.password_hash);
    if (!passwordOk || !existing.is_active) {
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
        throw new ConflictError("Already registered for this shop");
      }
      await authRepo.reactivateMembership(client, membership.id);
    } else {
      await authRepo.insertMembership(client, {
        shop_id: shop.id,
        customer_id: customer.id
      });
    }

    const accessToken = signCustomerAccessToken({
      userId: existing.id,
      shopId: shop.id,
      customerId: customer.id
    });

    return {
      accessToken,
      role: "customer",
      user: {
        id: existing.id,
        email: existing.email,
        registrationSource: existing.registration_source
      },
      shop: { id: shop.id, slug: shop.slug, name: shop.name },
      customer: { id: customer.id }
    };
  };
}
