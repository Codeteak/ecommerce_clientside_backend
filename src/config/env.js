// Purpose: Application env entry — validated config from buildEnv (single source of truth).
export { env } from "./env/buildEnv.js";
export {
  applyProductionEnvDefaults,
  getProductionDefaults,
  PRODUCTION_ENV_KEYS
} from "./env/productionDefaults.js";
