import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";

/**
 * Revoke current access sid (admin-style logout-current).
 * Also revokes all refresh tokens so the browser cannot silently re-login.
 */
export function createLogoutCustomer({ authRepo, accessTokenRegistry }) {
  return async function logoutCustomer(client, { accessToken, refreshToken = null }) {
    const payload = verifyCustomerAccessToken(accessToken);
    const userId = payload.sub;
    const jti = payload.jti || payload.sid;

    if (jti && accessTokenRegistry) {
      await accessTokenRegistry.revokeAccessJti(jti, userId);
    }

    await authRepo.revokeAllRefreshTokensForUser(client, userId);

    return { ok: true };
  };
}
