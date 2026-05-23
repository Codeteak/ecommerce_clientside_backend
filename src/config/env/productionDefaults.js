/**
 * Defaults applied only when NODE_ENV=production and the variable is unset in process.env.
 * Secrets (METRICS_SCRAPE_TOKEN, SERVICEABILITY_COOKIE_SECRET) must be set in AWS Secrets Manager — never hardcoded here.
 */
export const PRODUCTION_ENV_KEYS = [
  "JWT_ACCESS_EXPIRES_IN",
  "STOREFRONT_ENFORCE_SERVICEABILITY",
  "METRICS_SCRAPE_TOKEN",
  "SERVICEABILITY_COOKIE_SECRET",
  "REDIS_URL"
];

/** @returns {Record<string, string> | null} */
export function getProductionDefaults() {
  return {
    JWT_ACCESS_EXPIRES_IN: "15m",
    STOREFRONT_ENFORCE_SERVICEABILITY: "true",
    ENABLE_API_DOCS: "false",
    ALLOW_API_DOCS_IN_PRODUCTION: "false"
  };
}

/**
 * Apply production defaults to a raw env object (mutates in place).
 * @param {Record<string, string | undefined>} src
 * @param {string} nodeEnv
 */
export function applyProductionEnvDefaults(src, nodeEnv) {
  if (nodeEnv !== "production") return;
  const defaults = getProductionDefaults();
  for (const [key, value] of Object.entries(defaults)) {
    if (src[key] === undefined || src[key] === "") {
      src[key] = value;
    }
  }
}
