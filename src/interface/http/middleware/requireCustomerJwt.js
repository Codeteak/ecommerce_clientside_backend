import { verifyCustomerAccessToken } from "../../../infra/auth/jwt.js";

/**
 * Requires `Authorization: Bearer <JWT>` from email/password login or
 * {@link ../../controllers/authController.js OAuth → JWT exchange}.
 *
 * Sets `req.customerAuth` with `{ userId, customerId, shopId?, role }`.
 */
export function requireCustomerJwt() {
  return (req, res, next) => {
    const raw = req.headers.authorization;
    if (!raw || !raw.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Bearer token required"
        }
      });
    }

    const token = raw.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Bearer token required"
        }
      });
    }

    try {
      const payload = verifyCustomerAccessToken(token);
      req.customerAuth = {
        userId: payload.sub,
        customerId: payload.customerId,
        shopId: payload.shopId,
        role: payload.role
      };
      next();
    } catch {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token"
        }
      });
    }
  };
}
