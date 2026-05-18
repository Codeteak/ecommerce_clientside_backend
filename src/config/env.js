// Purpose: compatibility export for refactored env modules.
export { env } from "./env/buildEnv.js";

/**
 * Production-only env defaults (JWT_ACCESS_EXPIRES_IN=15m, STOREFRONT_ENFORCE_SERVICEABILITY=true)
 * are applied in buildEnv when NODE_ENV=production and those keys are unset.
 *
 * You must still set in AWS Secrets Manager (not auto-filled in code):
 * - METRICS_SCRAPE_TOKEN
 * - SERVICEABILITY_COOKIE_SECRET (min 16 chars, different from JWT_SECRET)
 */
export {
  applyProductionEnvDefaults,
  getProductionDefaults,
  PRODUCTION_ENV_KEYS
} from "./env/productionDefaults.js";
