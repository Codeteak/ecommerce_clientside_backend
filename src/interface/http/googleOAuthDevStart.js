import { getBaseURL } from "better-auth";
import { isAllowedOAuthCallbackOrigin } from "./oauthDevSuccessPage.js";

const SHOP_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Development-only: start Google OAuth from a normal browser tab so `oauth_state` is stored
 * in that browser (Postman + pasted Google URL never shares cookies with Chrome).
 *
 * Open: `{BETTER_AUTH_URL}{BETTER_AUTH_BASE_PATH}/dev/google-start?shopId=...` (optional `callbackURL`).
 * Default redirect is `{BETTER_AUTH_URL}/oauth/success` so you do not need Vite on 5173.
 *
 * @param {typeof import("../../config/env.js").env} env
 * @param {{ handler: (req: Request) => Promise<Response> }} auth
 */
export function createGoogleOAuthDevStartHandler(env, auth) {
  return async function googleOAuthDevStart(req, res, next) {
    try {
      const apiOrigin = env.BETTER_AUTH_URL.replace(/\/+$/, "");
      let callbackURL =
        typeof req.query.callbackURL === "string" && req.query.callbackURL.trim()
          ? req.query.callbackURL.trim()
          : `${apiOrigin}/oauth/success`;

      let parsedCallback;
      try {
        parsedCallback = new URL(callbackURL);
      } catch {
        return res.status(400).send("Invalid callbackURL");
      }

      if (!isAllowedOAuthCallbackOrigin(env, parsedCallback.origin)) {
        return res
          .status(400)
          .send("callbackURL origin must match CORS_ORIGIN or BETTER_AUTH_URL (use /oauth/success when no storefront)");
      }

      const shopRaw = typeof req.query.shopId === "string" ? req.query.shopId.trim() : "";
      const shopId = SHOP_ID_RE.test(shopRaw) ? shopRaw : undefined;

      const base = getBaseURL(env.BETTER_AUTH_URL, env.BETTER_AUTH_BASE_PATH);
      const signInUrl = `${base.replace(/\/+$/, "")}/sign-in/social`;

      const body = {
        provider: "google",
        callbackURL,
        disableRedirect: true,
        ...(shopId ? { additionalData: { shopId } } : {})
      };

      const baResponse = await auth.handler(
        new Request(signInUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: env.CORS_ORIGIN
          },
          body: JSON.stringify(body)
        })
      );

      const cookies = baResponse.headers.getSetCookie?.() ?? [];
      for (const c of cookies) {
        res.append("Set-Cookie", c);
      }

      if (!baResponse.ok) {
        const text = await baResponse.text();
        return res.status(baResponse.status).send(text || "OAuth start failed");
      }

      const data = await baResponse.json();
      if (!data?.url) {
        return res.status(502).json({ error: "oauth_start_failed", body: data });
      }

      return res.redirect(302, data.url);
    } catch (err) {
      next(err);
    }
  };
}
