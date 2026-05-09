import { AuthError } from "../../../domain/errors/AuthError.js";
import {
  signCustomerAccessToken,
  signCustomerRefreshToken,
  verifyCustomerAccessToken,
  verifyCustomerRefreshToken
} from "../../../infra/auth/jwt.js";
import { buildProfileFromShops } from "./customerProfile.js";
import { hashToken } from "../../../infra/security/tokenHash.js";

/**
 * Build the same JSON body as successful `login` / OAuth completion (JWT + profile + shopIds).
 * @param {import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo} authRepo
 * @param {import("pg").PoolClient} client
 * @param {string} userId
 */
export async function buildStorefrontSessionResponse(authRepo, client, userId, sessionMeta = {}) {
  const user = await authRepo.getUserById(client, userId);
  if (!user || !user.is_active) {
    throw new AuthError("Invalid credentials");
  }

  const customer = await authRepo.getCustomerByUserId(client, user.id);
  if (!customer || customer.is_blocked || customer.is_deleted) {
    throw new AuthError("Invalid credentials");
  }

  const shops = await authRepo.listActiveShopsForCustomer(client, customer.id);
  const shopIds = shops.map((s) => s.id);
  const profile = buildProfileFromShops(customer, shops);

  const accessToken = signCustomerAccessToken({
    userId: user.id,
    customerId: customer.id,
    shopId: shopIds.length === 1 ? shopIds[0] : undefined
  });
  const payload = verifyCustomerAccessToken(accessToken);
  const ttlMs = Number(payload.exp) * 1000 - Date.now();
  if (sessionMeta?.sessionCache && ttlMs > 0) {
    await sessionMeta.sessionCache.storeSession({
      userId: user.id,
      sessionId: hashToken(accessToken),
      ttlMs
    });
  }
  const refresh = signCustomerRefreshToken({
    userId: user.id,
    customerId: customer.id
  });
  const refreshPayload = verifyCustomerRefreshToken(refresh.token);
  await authRepo.insertRefreshToken(client, {
    userId: user.id,
    customerId: customer.id,
    subjectType: "customer",
    tokenHash: hashToken(refresh.token),
    jti: refresh.jti,
    expiresAtIso: new Date(Number(refreshPayload.exp) * 1000).toISOString(),
    issuedIp: sessionMeta?.ip ?? null,
    userAgent: sessionMeta?.userAgent ?? null
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    role: "customer",
    user: {
      id: user.id,
      email: user.email,
      registrationSource: user.registration_source
    },
    customer: { id: customer.id },
    shopIds,
    profile
  };
}
