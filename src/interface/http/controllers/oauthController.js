import { env } from "../../../config/env.js";
import { AuthError } from "../../../domain/errors/AuthError.js";
import { ServiceUnavailableError } from "../../../domain/errors/ServiceUnavailableError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { withTx } from "../../../infra/db/tx.js";
import {
  assertGoogleOAuthConfigured,
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo
} from "../../../infra/oauth/googleOAuth.js";
import { oauthExchangeCookieOptions, signOAuthExchangeCookie } from "../../../infra/oauth/oauthExchangeCookie.js";
import { createOAuthStatePayload, signOAuthState, verifyOAuthState } from "../../../infra/oauth/oauthState.js";

/**
 * @param {import("../../../main/composition.js").AppContext} ctx
 */
export const oauthController = {
  ok: () => (_req, res, next) => {
    try {
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  success: () => (_req, res) => {
    res.json({
      ok: true,
      message:
        "POST /api/auth/oauth/jwt from this origin with credentials (include cookies) to receive accessToken."
    });
  },

  signInSocialGet: () => (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Use POST with JSON body (provider, optional disableRedirect, callbackURL, additionalData)."
      }
    });
  },

  devGoogleStart: (_ctx) => async (req, res, next) => {
    try {
      if (!assertGoogleOAuthConfigured()) {
        throw new ServiceUnavailableError(
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        );
      }
      const shopId = req.query.shopId ?? undefined;
      const callbackURL = req.query.callbackURL ?? undefined;
      const signed = signOAuthState(
        createOAuthStatePayload({ shopId, callbackURL, disableRedirect: false })
      );
      const url = buildGoogleAuthorizationUrl(signed);
      if (!url) {
        throw new ServiceUnavailableError("Google OAuth is not configured.");
      }
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  },

  socialSignIn: (_ctx) => async (req, res, next) => {
    try {
      if (!assertGoogleOAuthConfigured()) {
        throw new ServiceUnavailableError(
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        );
      }
      const shopId = req.body.additionalData?.shopId;
      const callbackURL = req.body.callbackURL ?? undefined;
      const disableRedirect = !!req.body.disableRedirect;
      const signed = signOAuthState(
        createOAuthStatePayload({ shopId, callbackURL, disableRedirect })
      );
      const url = buildGoogleAuthorizationUrl(signed);
      if (!url) {
        throw new ServiceUnavailableError("Google OAuth is not configured.");
      }
      if (disableRedirect) {
        return res.json({ url });
      }
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  },

  googleCallback: (ctx) => async (req, res, next) => {
    const cookieOpts = oauthExchangeCookieOptions();
    try {
      const oauthErr = req.query.error;
      if (oauthErr) {
        const desc = req.query.error_description;
        throw new ValidationError(`Google OAuth error: ${desc ?? oauthErr}`);
      }

      const code = req.query.code;
      const state = req.query.state;
      if (!code || typeof code !== "string" || !state || typeof state !== "string") {
        throw new ValidationError("Missing OAuth code or state");
      }

      const payload = verifyOAuthState(state);
      if (!payload || typeof payload !== "object") {
        throw new AuthError("Invalid or expired OAuth state");
      }

      const shopId = payload.shopId ?? undefined;
      const base = env.API_PUBLIC_URL.replace(/\/$/, "");
      const callbackURL =
        typeof payload.callbackURL === "string" && payload.callbackURL
          ? payload.callbackURL
          : `${base}/api/oauth/success`;

      const accessToken = await exchangeGoogleAuthorizationCode(code);
      const info = await fetchGoogleUserInfo(accessToken);
      if (!info.email || !info.email_verified) {
        throw new AuthError("Google did not return a verified email");
      }

      const email = info.email.trim().toLowerCase();
      const displayName = info.name ?? info.given_name ?? null;

      const { user } = await withTx((client) =>
        ctx.provisionCustomerForOAuthShop(client, {
          email,
          displayName,
          shopId
        })
      );

      const exch = signOAuthExchangeCookie(user.id);
      res.cookie("storefront_oauth_exchange", exch, cookieOpts);
      res.redirect(302, callbackURL);
    } catch (err) {
      next(err);
    }
  }
};
