import { AuthError } from "../../../domain/errors/AuthError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { shopAllowsCustomers } from "./shopPolicy.js";

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeDisplayName(raw) {
  const val = String(raw || "").trim();
  return val.length ? val : null;
}

export function provisionCustomerForOAuthShop({ authRepo }) {
  return async function runProvisionCustomerForOAuthShop(client, input) {
    const email = normalizeEmail(input?.email);
    const displayName = normalizeDisplayName(input?.displayName);
    const shopId = String(input?.shopId || "").trim();

    if (!email || !shopId) {
      throw new ValidationError("email and shopId are required");
    }

    if (await authRepo.isEmailUsedByActiveShopStaff(client, email)) {
      throw new AuthError("Invalid credentials");
    }

    const user = await authRepo.getUserByEmail(client, email);
    if (!user || !user.is_active) {
      throw new AuthError("Invalid credentials");
    }
    if (await authRepo.isUserActiveShopStaff(client, user.id)) {
      throw new AuthError("Invalid credentials");
    }

    const customer = await authRepo.getCustomerByUserId(client, user.id);
    if (!customer || customer.is_blocked || customer.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    const membership = await authRepo.getMembershipByCustomerAndShop(client, customer.id, shop.id);
    if (!membership || membership.is_blocked || !membership.is_active || membership.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    return {
      user,
      customer: {
        ...customer,
        display_name: customer.display_name ?? displayName
      },
      shop,
      membership
    };
  };
}
