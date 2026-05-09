import { AuthError } from "../../../domain/errors/AuthError.js";
import {
  signCustomerAccessToken,
  signCustomerRefreshToken,
  verifyCustomerRefreshToken
} from "../../../infra/auth/jwt.js";
import { hashToken } from "../../../infra/security/tokenHash.js";

export function createRotateCustomerRefreshToken({ authRepo }) {
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

    const accessToken = signCustomerAccessToken({
      userId: payload.sub,
      customerId: payload.customerId
    });

    return {
      accessToken,
      refreshToken: nextRefresh.token
    };
  };
}
