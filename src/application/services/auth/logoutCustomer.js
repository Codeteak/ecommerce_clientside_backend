import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { hashToken } from "../../../infra/security/tokenHash.js";

/**
 * Revoke current access jti and all refresh tokens for the user.
 */
export function createLogoutCustomer({ authRepo, accessTokenRegistry }) {
  return async function logoutCustomer(client, { accessToken, refreshToken = null }) {
    const payload = verifyCustomerAccessToken(accessToken);
    const userId = payload.sub;
    const jti = payload.jti;

    if (jti && accessTokenRegistry) {
      await accessTokenRegistry.revokeAccessJti(jti);
    }
    await accessTokenRegistry?.revokeAllAccessForUser(userId);

    await authRepo.revokeAllRefreshTokensForUser(client, userId);

    return { ok: true };
  };
}
