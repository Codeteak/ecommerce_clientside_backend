import { AuthError } from "../../../domain/errors/AuthError.js";
import {
  verifyCustomerAccessToken,
  verifyCustomerRefreshToken
} from "../../../infra/auth/jwt.js";

/**
 * Revoke the current session.
 * Accepts a valid access Bearer and/or a refresh token body so logout still works
 * when the short-lived access JWT has already expired.
 */
export function createLogoutCustomer({ authRepo, accessTokenRegistry }) {
  return async function logoutCustomer(client, { accessToken = null, refreshToken = null }) {
    let userId = null;
    let accessJti = null;

    const access = typeof accessToken === "string" ? accessToken.trim() : "";
    if (access) {
      try {
        const payload = verifyCustomerAccessToken(access);
        userId = payload.sub;
        accessJti = payload.jti || payload.sid || null;
      } catch {
        /* fall through to refresh token */
      }
    }

    const refresh = typeof refreshToken === "string" ? refreshToken.trim() : "";
    if (!userId && refresh) {
      try {
        const payload = verifyCustomerRefreshToken(refresh);
        userId = payload.sub;
      } catch {
        throw new AuthError("Invalid or expired token");
      }
    }

    if (!userId) {
      throw new AuthError("Invalid or expired token");
    }

    if (accessJti && accessTokenRegistry) {
      await accessTokenRegistry.revokeAccessJti(accessJti, userId);
    }

    await authRepo.revokeAllRefreshTokensForUser(client, userId);

    if (accessTokenRegistry && typeof accessTokenRegistry.revokeAllAccessForUser === "function") {
      await accessTokenRegistry.revokeAllAccessForUser(userId);
    }

    return { ok: true };
  };
}
