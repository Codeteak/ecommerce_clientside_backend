import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";
import { logApiWarn } from "../../../infra/logging/apiLog.js";

/**
 * @param {{
 *   authRepo: import("../../../application/ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   skipDbSessionCheck: boolean,
 *   sessionValidityCache?: { get: (key: string) => boolean | undefined, set: (key: string, valid: boolean) => void }
 * }} deps
 */
export function createRequireCustomerJwt({ authRepo, skipDbSessionCheck, sessionValidityCache }) {
  /**
   * Requires `Authorization: Bearer <JWT>` from `POST /api/auth/oauth/jwt` (or a trusted JWT).
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

        if (!skipDbSessionCheck) {
          const cacheKey = `${userId}:${customerId}`;
          const cached = sessionValidityCache?.get(cacheKey);
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

          const ok = await authRepo.isCustomerSessionValid(userId, customerId);
          sessionValidityCache?.set(cacheKey, ok);
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
