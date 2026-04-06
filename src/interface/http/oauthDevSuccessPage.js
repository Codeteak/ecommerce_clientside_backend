import { env } from "../../config/env.js";

/** @param {typeof env} envConfig */
export function isAllowedOAuthCallbackOrigin(envConfig, origin) {
  const allowed = new Set([new URL(envConfig.CORS_ORIGIN).origin, new URL(envConfig.BETTER_AUTH_URL).origin]);
  return allowed.has(origin);
}

/** Development-only landing page after Google redirects (use when Vite is not running). */
export function oauthDevSuccessPage(_req, res) {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Signed in</title></head>
<body style="font-family:system-ui;margin:2rem">
  <h1>Google sign-in complete</h1>
  <p>Better Auth session cookie is set on <strong>${new URL(env.BETTER_AUTH_URL).host}</strong>.</p>
  <p>You can close this tab or start your storefront on the port expected by <code>CORS_ORIGIN</code>.</p>
</body></html>`);
}
