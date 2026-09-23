import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { AuthError } from "../../../domain/errors/AuthError.js";
import { hashToken } from "../../../infra/security/tokenHash.js";
import { logApiWarn } from "../../../infra/logging/apiLog.js";
import { patchRequestContext } from "../../../infra/logging/requestContext.js";

const SESSION_ENDED_MESSAGE = "Your session has expired. Please sign in again.";

/** DB fallback is only for Redis outage — never for missing/revoked JTIs (logout). */
const JTI_DB_FALLBACK_REASONS = new Set(["redis_unavailable", "redis_not_configured"]);

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
 *   shouldUseSessionCache?: (req: import("express").Request) => boolean,
 *   allowJtiDbFallback?: boolean
 * }} deps
 */
export function createRequireCustomerJwt({
  authRepo,
  accessTokenRegistry,
  skipDbSessionCheck,
  sessionValidityCache,
  shouldUseSessionCache = () => true,
  allowJtiDbFallback = false
}) {
  return function requireCustomerJwt() {
    /** @type {import("express").RequestHandler} */
    const handler = async (req, _res, next) => {
      const raw = req.headers.authorization;
      if (!raw || !raw.startsWith("Bearer ")) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "missing_bearer_token" });
        return next(new AuthError("Please sign in to continue."));
      }

      const token = raw.slice("Bearer ".length).trim();
      if (!token) {
        logApiWarn("api.auth.rejected", req, { code: "UNAUTHORIZED", reason: "empty_bearer_token" });
        return next(new AuthError("Please sign in to continue."));
      }

      try {
        const payload = verifyCustomerAccessToken(token);
        const userId = payload.sub;
        const customerId = payload.customerId;
        const jti = payload.jti || payload.sid;
        const sessionId = jti || hashToken(token);

        let jtiFallbackReason = null;
        if (accessTokenRegistry && jti && !skipDbSessionCheck) {
          const status =
            typeof accessTokenRegistry.getAccessJtiStatus === "function"
              ? await accessTokenRegistry.getAccessJtiStatus(jti)
              : { active: await accessTokenRegistry.isAccessJtiActive(jti), reason: "legacy" };
          if (!status.active) {
            const reason = status.reason || "inactive_jti";
            const canFallback =
              allowJtiDbFallback && !skipDbSessionCheck && JTI_DB_FALLBACK_REASONS.has(reason);
            if (canFallback) {
              jtiFallbackReason = reason;
              logApiWarn("api.auth.jti_db_fallback", req, {
                code: "ACCESS_JTI_DB_FALLBACK",
                reason: jtiFallbackReason,
                userId,
                customerId
              });
            } else {
              logApiWarn("api.auth.rejected", req, {
                code: "UNAUTHORIZED",
                reason: reason === "jti_missing" ? "revoked_or_missing_access_jti" : reason,
                userId,
                customerId
              });
              return next(new AuthError(SESSION_ENDED_MESSAGE));
            }
          }
        }

        if (!skipDbSessionCheck) {
          const cacheKey = `${userId}:${sessionId}`;
          const useCache = shouldUseSessionCache(req);
          if (useCache && !jtiFallbackReason) {
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
              return next(new AuthError(SESSION_ENDED_MESSAGE));
            }
          }

          const ok = await authRepo.isCustomerSessionValid(userId, customerId);
          const ttlMs = Number(payload.exp) * 1000 - Date.now();
          if (useCache && !jtiFallbackReason) {
            await sessionValidityCache?.set(cacheKey, ok, ttlMs);
          }
          if (!ok) {
            if (accessTokenRegistry && jti) {
              await accessTokenRegistry.revokeAccessJti(jti, userId);
            }
            logApiWarn("api.auth.rejected", req, {
              code: "UNAUTHORIZED",
              reason: "invalid_db_session",
              userId,
              customerId
            });
            return next(new AuthError(SESSION_ENDED_MESSAGE));
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
        return next(new AuthError(SESSION_ENDED_MESSAGE));
      }
    };

    return handler;
  };
}
