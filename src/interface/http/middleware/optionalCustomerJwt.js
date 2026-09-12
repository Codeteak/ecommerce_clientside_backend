import { createRequireCustomerJwt } from "./requireCustomerJwt.js";

/**
 * Optional customer JWT: if Authorization Bearer is present, validates like requireCustomerJwt;
 * otherwise continues with req.customerAuth unset (guest).
 *
 * @param {Parameters<typeof createRequireCustomerJwt>[0]} deps
 */
export function createOptionalCustomerJwt(deps) {
  const requireCustomerJwt = createRequireCustomerJwt(deps);

  return function optionalCustomerJwt() {
    const strict = requireCustomerJwt();
    /** @type {import("express").RequestHandler} */
    const handler = async (req, res, next) => {
      const raw = req.headers.authorization;
      if (!raw || !raw.startsWith("Bearer ") || !raw.slice("Bearer ".length).trim()) {
        return next();
      }
      return strict(req, res, next);
    };
    return handler;
  };
}
