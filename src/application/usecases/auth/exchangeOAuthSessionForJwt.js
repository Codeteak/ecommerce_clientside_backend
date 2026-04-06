import { AuthError } from "../../../domain/errors/AuthError.js";
import { signCustomerAccessToken } from "../../../infra/auth/jwt.js";

/**
 * Purpose: Turn a Google sign-in (by email) into the same JWT you get from email/password login.
 * Only works if we already saved that person as a storefront user and customer.
 */
export function exchangeOAuthSessionForJwt({ authRepo }) {
  return async function execute(client, email) {
    const user = await authRepo.getUserByEmail(client, email);
    if (!user || !user.is_active) {
      throw new AuthError(
        "No storefront profile for this account. Complete Google sign-in with shopId in additionalData, or register with email for this shop."
      );
    }

    const customer = await authRepo.getCustomerByUserId(client, user.id);
    if (!customer || customer.is_blocked || customer.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    const shopIds = await authRepo.listShopIdsForCustomer(client, customer.id);

    const accessToken = signCustomerAccessToken({
      userId: user.id,
      customerId: customer.id
    });

    return {
      accessToken,
      role: "customer",
      user: {
        id: user.id,
        email: user.email,
        registrationSource: user.registration_source
      },
      customer: { id: customer.id },
      shopIds
    };
  };
}
