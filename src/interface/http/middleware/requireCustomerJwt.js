import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { hashToken } from "../../../infra/security/tokenHash.js";
import { logApiWarn } from "../../../infra/logging/apiLog.js";

/**
 * @param {{
 *   authRepo: import("../../../application/ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   skipDbSessionCheck: boolean,
 *   sessionValidityCache?: { get: (key: string) => Promise<boolean | undefined> | boolean | undefined, set: (key: string, valid: boolean, ttlMs?: number) => Promise<void> | void },
 *   shouldUseSessionCache?: (req: import("express").Request) => boolean
 * }} deps
 */
export function createRequireCustomerJwt({
  authRepo,
  skipDbSessionCheck,
  sessionValidityCache,
  shouldUseSessionCache = () => true
}) {
  /**
   * Requires `Authorization: Bearer <JWT>` from OTP verification endpoints (or a trusted JWT).
   * Optionally re-checks DB so revoked/blocked users lose access before token expiry.
   *
   * Sets `req.customerAuth` with `{ userId, customerId, shopId?, role }`.
   */
  return function requireCustomerJwt() {
    /** @type {import("express").RequestHandler} */
    const handler = async (req, res, next) => {
      const raw = req.headers.authorization;
      if (!raw || !raw.startsWith("Bearer ")) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "missing_bearer_token" });
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Bearer token required"
          }
        });
      }

      const token = raw.slice("Bearer ".length).trim();
      if (!token) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "empty_bearer_token" });
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Bearer token required"
          }
        });
      }

      try {
        const payload = verifyCustomerAccessToken(token);
        const userId = payload.sub;
        const customerId = payload.customerId;
        const sessionId = hashToken(token);

        if (!skipDbSessionCheck) {
          const cacheKey = `${userId}:${sessionId}`;
          const useCache = shouldUseSessionCache(req);
          if (useCache) {
            const cached = await sessionValidityCache?.get(cacheKey);
            if (cached === true) {
              req.customerAuth = {
                userId,
                customerId,
                shopId: payload.shopId,
                role: payload.role
              };
              return next();
            }
            if (cached === false) {
              logApiWarn("api.auth.rejected", req, {
                code: "UNAUTHORIZED",
                reason: "invalid_db_session",
                userId,
                customerId
              });
              return res.status(401).json({
                error: {
                  code: "UNAUTHORIZED",
                  message: "Session is no longer valid"
                }
              });
            }
          }

          const ok = await authRepo.isCustomerSessionValid(userId, customerId);
          const ttlMs = Number(payload.exp) * 1000 - Date.now();
          if (useCache) {
            await sessionValidityCache?.set(cacheKey, ok, ttlMs);
          }
          if (!ok) {
            logApiWarn("api.auth.rejected", req, {
              code: "UNAUTHORIZED",
              reason: "invalid_db_session",
              userId,
              customerId
            });
            return res.status(401).json({
              error: {
                code: "UNAUTHORIZED",
                message: "Session is no longer valid"
              }
            });
          }
        }

        req.customerAuth = {
          userId,
          customerId,
          shopId: payload.shopId,
          role: payload.role
        };
        next();
      } catch {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "invalid_or_expired_token" });
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired token"
          }
        });
      }
    };

    return handler;
  };
}
