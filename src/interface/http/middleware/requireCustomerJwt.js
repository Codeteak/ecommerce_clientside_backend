import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { hashToken } from "../../../infra/security/tokenHash.js";
import { logApiWarn } from "../../../infra/logging/apiLog.js";
import { patchRequestContext } from "../../../infra/logging/requestContext.js";

function setCustomerAuth(req, auth) {
  req.customerAuth = auth;
  patchRequestContext({
    userId: auth.userId,
    customerId: auth.customerId,
    shopId: auth.shopId || req.shopId
  });
}

/**
 * @param {{
 *   authRepo: import("../../../application/ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   accessTokenRegistry?: ReturnType<import("../../../infra/auth/accessTokenRegistry.js").createAccessTokenRegistry>,
 *   skipDbSessionCheck: boolean,
 *   sessionValidityCache?: { get: (key: string) => Promise<boolean | undefined> | boolean | undefined, set: (key: string, valid: boolean, ttlMs?: number) => Promise<void> | void },
 *   shouldUseSessionCache?: (req: import("express").Request) => boolean
 * }} deps
 */
export function createRequireCustomerJwt({
  authRepo,
  accessTokenRegistry,
  skipDbSessionCheck,
  sessionValidityCache,
  shouldUseSessionCache = () => true
}) {
  return function requireCustomerJwt() {
    /** @type {import("express").RequestHandler} */
    const handler = async (req, res, next) => {
      const raw = req.headers.authorization;
      if (!raw || !raw.startsWith("Bearer ")) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "missing_bearer_token" });
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Bearer token required" }
        });
      }

      const token = raw.slice("Bearer ".length).trim();
      if (!token) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "empty_bearer_token" });
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Bearer token required" }
        });
      }

      try {
        const payload = verifyCustomerAccessToken(token);
        const userId = payload.sub;
        const customerId = payload.customerId;
        const jti = payload.jti;
        const sessionId = jti || hashToken(token);

        if (accessTokenRegistry && jti) {
          const active = await accessTokenRegistry.isAccessJtiActive(jti);
          if (!active) {
            logApiWarn("api.auth.rejected", req, {
              code: "UNAUTHORIZED",
              reason: "revoked_access_jti",
              userId,
              customerId
            });
            return res.status(401).json({
              error: { code: "UNAUTHORIZED", message: "Session is no longer valid" }
            });
          }
        }

        if (!skipDbSessionCheck) {
          const cacheKey = `${userId}:${sessionId}`;
          const useCache = shouldUseSessionCache(req);
          if (useCache) {
            const cached = await sessionValidityCache?.get(cacheKey);
            if (cached === true) {
              setCustomerAuth(req, {
                userId,
                customerId,
                shopId: payload.shopId,
                role: payload.role
              });
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
                error: { code: "UNAUTHORIZED", message: "Session is no longer valid" }
              });
            }
          }

          const ok = await authRepo.isCustomerSessionValid(userId, customerId);
          const ttlMs = Number(payload.exp) * 1000 - Date.now();
          if (useCache) {
            await sessionValidityCache?.set(cacheKey, ok, ttlMs);
          }
          if (!ok) {
            if (accessTokenRegistry && jti) {
              await accessTokenRegistry.revokeAccessJti(jti);
            }
            logApiWarn("api.auth.rejected", req, {
              code: "UNAUTHORIZED",
              reason: "invalid_db_session",
              userId,
              customerId
            });
            return res.status(401).json({
              error: { code: "UNAUTHORIZED", message: "Session is no longer valid" }
            });
          }
        }

        setCustomerAuth(req, {
          userId,
          customerId,
          shopId: payload.shopId,
          role: payload.role
        });
        next();
      } catch {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "invalid_or_expired_token" });
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Invalid or expired token" }
        });
      }
    };

    return handler;
  };
}
