import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";

/**
 * If a valid Bearer customer JWT is present, sets `req.customerAuth` (same shape as requireCustomerJwt).
 * Invalid or missing token: continues as guest (no `req.customerAuth`).
 */
export function createOptionalCustomerJwt({ authRepo, skipDbSessionCheck }) {
  return function optionalCustomerJwt() {
    /** @type {import("express").RequestHandler} */
    const handler = async (req, _res, next) => {
      const raw = req.headers.authorization;
      if (!raw || !raw.startsWith("Bearer ")) {
        return next();
      }
      const token = raw.slice("Bearer ".length).trim();
      if (!token) {
        return next();
      }
      try {
        const payload = verifyCustomerAccessToken(token);
        const userId = payload.sub;
        const customerId = payload.customerId;
        if (!skipDbSessionCheck) {
          const ok = await authRepo.isCustomerSessionValid(userId, customerId);
          if (!ok) {
            return next();
          }
        }
        req.customerAuth = {
          userId,
          customerId,
          shopId: payload.shopId,
          role: payload.role
        };
      } catch {
        /* treat as guest */
      }
      next();
    };
    return handler;
  };
}
