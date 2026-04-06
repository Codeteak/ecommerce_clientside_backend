import { fromNodeHeaders } from "better-auth/node";
import { withClient, withTx } from "../../../infra/db/tx.js";

export const authController = {
  register: (ctx) => async (req, res, next) => {
    try {
      const result = await withTx((client) => ctx.registerCustomer(client, req.body));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  login: (ctx) => async (req, res, next) => {
    try {
      const result = await withClient((client) => ctx.loginCustomer(client, req.body));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** `POST /api/auth/oauth/jwt` — requires `better-auth` session cookie (same as OAuth callback). */
  oauthJwt: (ctx) => async (req, res, next) => {
    try {
      const session = await ctx.auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
      });
      const email = session?.user?.email;
      if (!email) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "No OAuth session. Sign in with Google first (credentials included)."
          }
        });
      }

      const result = await withClient((client) => ctx.exchangeOAuthSessionForJwt(client, email));
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
};
