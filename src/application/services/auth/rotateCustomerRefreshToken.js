import { AuthError } from "../../../domain/errors/AuthError.js";
import {
  signCustomerAccessToken,
  signCustomerRefreshToken,
  verifyCustomerRefreshToken
} from "../../../infra/auth/jwt.js";
import { accessTokenTtlSec } from "../../../infra/auth/accessTokenRegistry.js";
import { hashToken } from "../../../infra/security/tokenHash.js";

/**
 * Rotate refresh token: verify JWT, consume DB row, issue new access + refresh pair.
 */
export function createRotateCustomerRefreshToken({ authRepo, accessTokenRegistry }) {
  return async function rotateCustomerRefreshToken(client, { refreshToken, ip, userAgent }) {
    let payload;
    try {
      payload = verifyCustomerRefreshToken(refreshToken);
    } catch (_err) {
      throw new AuthError("Invalid or expired token");
    }
    const currentHash = hashToken(refreshToken);

    const nextRefresh = signCustomerRefreshToken({
      userId: payload.sub,
      customerId: payload.customerId
    });
    const nextPayload = verifyCustomerRefreshToken(nextRefresh.token);
    const nextHash = hashToken(nextRefresh.token);

    const consumed = await authRepo.consumeRefreshToken(client, currentHash, nextHash);
    if (!consumed) {
      const existing = await authRepo.findRefreshTokenByHash(client, currentHash);
      if (existing?.consumed_at) {
        await authRepo.revokeAllRefreshTokensForUser(client, existing.user_id);
        if (accessTokenRegistry) {
          await accessTokenRegistry.revokeAllAccessForUser(existing.user_id);
        }
      }
      throw new AuthError("Invalid or expired token");
    }

    await authRepo.insertRefreshToken(client, {
      userId: payload.sub,
      customerId: payload.customerId,
      subjectType: "customer",
      tokenHash: nextHash,
      jti: nextRefresh.jti,
      expiresAtIso: new Date(Number(nextPayload.exp) * 1000).toISOString(),
      issuedIp: ip ?? null,
      userAgent: userAgent ?? null
    });

    const access = signCustomerAccessToken({
      userId: payload.sub,
      customerId: payload.customerId
    });

    if (accessTokenRegistry) {
      await accessTokenRegistry.registerAccessJti(payload.sub, access.jti, accessTokenTtlSec());
    }

    return {
      accessToken: access.token,
      refreshToken: nextRefresh.token
    };
  };
}
