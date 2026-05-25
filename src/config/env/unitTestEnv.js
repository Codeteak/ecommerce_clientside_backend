/**
 * Forced env values during unit tests (NODE_ENV=test, not integration).
 * Overrides shell/CodeBuild deploy vars so tests do not hit real Redis or CDN URLs.
 */
export const UNIT_TEST_ENV_OVERRIDES = {
  REDIS_URL: "",
  OBJECT_STORAGE_PUBLIC_BASE_URL: "https://storage.test",
  DISABLE_RATE_LIMITING: "true"
};

/** Keys cleared in scripts/cicd/run-unit-tests.sh before vitest (optional; buildEnv also forces overrides). */
export const UNIT_TEST_ENV_UNSET_KEYS = [
  "CORS_ORIGIN",
  "API_PUBLIC_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_PREVIOUS_SECRET",
  "JWT_PREVIOUS_REFRESH_SECRET",
  "SERVICEABILITY_COOKIE_SECRET",
  "OBJECT_STORAGE_PUBLIC_BASE_URL",
  "STOREFRONT_ROOT_DOMAIN",
  "MSG_AUTH_KEY",
  "MSG91_AUTHKEY",
  "OTP_TEMPLATE_ID",
  "MSG91_TEMPLATE_ID",
  "METRICS_SCRAPE_TOKEN",
  "CATALOG_CACHE_INVALIDATE_TOKEN",
  "SENTRY_DSN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
];

/**
 * @param {Record<string, string | undefined>} src
 * @param {string} nodeEnv
 * @param {boolean} runIntegration
 */
export function applyUnitTestEnvOverrides(src, nodeEnv, runIntegration) {
  if (nodeEnv !== "test" || runIntegration) return;
  for (const [key, value] of Object.entries(UNIT_TEST_ENV_OVERRIDES)) {
    src[key] = value;
  }
}
