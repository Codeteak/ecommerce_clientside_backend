import dotenv from "dotenv";
import { envSchema } from "./schema.js";
import { getDevLikeDefaults } from "./defaults.js";
import { applyProductionEnvDefaults } from "./productionDefaults.js";

dotenv.config();

function rawEnv() {
  const src = { ...process.env };
  // AWS Secrets Manager uses MSG_AUTH_KEY; legacy local env may still set MSG91_AUTHKEY.
  if (!String(src.MSG_AUTH_KEY || "").trim() && String(src.MSG91_AUTHKEY || "").trim()) {
    src.MSG_AUTH_KEY = src.MSG91_AUTHKEY;
  }
  // Prefer OTP_TEMPLATE_ID; legacy env files may still use MSG91_TEMPLATE_ID.
  if (!String(src.OTP_TEMPLATE_ID || "").trim() && String(src.MSG91_TEMPLATE_ID || "").trim()) {
    src.OTP_TEMPLATE_ID = src.MSG91_TEMPLATE_ID;
  }
  const nodeEnv = src.NODE_ENV || "development";
  const devLikeDefaults = getDevLikeDefaults(nodeEnv);
  const runIntegration =
    src.RUN_INTEGRATION_TESTS === "true" || src.RUN_INTEGRATION_TESTS === "1";

  if (devLikeDefaults) {
    for (const [k, v] of Object.entries(devLikeDefaults)) {
      if (src[k] === undefined || src[k] === "") {
        src[k] = v;
      }
    }
  }

  if (nodeEnv === "test") {
    // CodeBuild may inject deploy secrets that fail zod (e.g. short JWT). Coerce only when invalid.
    if (!runIntegration) {
      if (!String(src.JWT_SECRET || "").trim() || String(src.JWT_SECRET).length < 16) {
        src.JWT_SECRET = "test_jwt_secret_16_chars";
      }
      if (
        !String(src.JWT_REFRESH_SECRET || "").trim() ||
        String(src.JWT_REFRESH_SECRET).length < 16
      ) {
        src.JWT_REFRESH_SECRET = "test_jwt_refresh_secret_16_chars";
      }
    } else {
      src.JWT_SECRET ??= "test_jwt_secret_16_chars";
      src.JWT_REFRESH_SECRET ??= "test_jwt_refresh_secret_16_chars";
    }
  }

  if (nodeEnv === "development") {
    src.JWT_SECRET ??= "dev_only_change_me_please";
    src.JWT_REFRESH_SECRET ??= "dev_refresh_only_change_me";
  }

  if (nodeEnv !== "production") {
    if (src.JWT_ACCESS_EXPIRES_IN === undefined || src.JWT_ACCESS_EXPIRES_IN === "") {
      src.JWT_ACCESS_EXPIRES_IN = src.JWT_EXPIRES_IN || "15m";
    }
  }

  applyProductionEnvDefaults(src, nodeEnv);

  return src;
}

const parsed = envSchema.safeParse(rawEnv());
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const apiPublic = parsed.data.API_PUBLIC_URL.replace(/\/$/, "");
const derivedPoolMax =
  parsed.data.NODE_ENV === "test"
    ? parsed.data.DATABASE_POOL_MAX_TEST
    : parsed.data.NODE_ENV === "production"
      ? parsed.data.DATABASE_POOL_MAX_PROD
      : parsed.data.DATABASE_POOL_MAX_DEV;

export const env = {
  ...parsed.data,
  API_PUBLIC_URL: apiPublic,
  DATABASE_URL: parsed.data.DATABASE_URL.trim(),
  DATABASE_POOL_MAX: parsed.data.DATABASE_POOL_MAX ?? derivedPoolMax,
  STOREFRONT_ROOT_DOMAIN: parsed.data.STOREFRONT_ROOT_DOMAIN?.trim() || "",
  OBJECT_STORAGE_PUBLIC_BASE_URL: parsed.data.OBJECT_STORAGE_PUBLIC_BASE_URL?.trim() || "",
  REDIS_URL: parsed.data.REDIS_URL?.trim() || "",
  SMTP_HOST: parsed.data.SMTP_HOST?.trim() || "",
  SMTP_PORT: parsed.data.SMTP_PORT ?? 587,
  SMTP_USER: parsed.data.SMTP_USER?.trim() || "",
  SMTP_PASS: parsed.data.SMTP_PASS || "",
  SMTP_SECURE: parsed.data.SMTP_SECURE ?? false,
  OTP_FROM_EMAIL: parsed.data.OTP_FROM_EMAIL?.trim() || "",
  MSG_AUTH_KEY: parsed.data.MSG_AUTH_KEY?.trim() || "",
  // Single fallback source when env/secret is absent; keep this aligned with active MSG91 Flow template.
  OTP_TEMPLATE_ID: parsed.data.OTP_TEMPLATE_ID?.trim() || "69f592e0bd83b71e690c8cd2",
  MSG91_SHORT_URL: parsed.data.MSG91_SHORT_URL ?? "0",
  MSG91_REQUEST_TIMEOUT_MS: parsed.data.MSG91_REQUEST_TIMEOUT_MS ?? 15_000,
  JWT_PREVIOUS_SECRET: parsed.data.JWT_PREVIOUS_SECRET?.trim() || "",
  JWT_PREVIOUS_REFRESH_SECRET: parsed.data.JWT_PREVIOUS_REFRESH_SECRET?.trim() || "",
  STOREFRONT_DELIVERY_FEE_MINOR: parsed.data.STOREFRONT_DELIVERY_FEE_MINOR ?? 0,
  STOREFRONT_ENFORCE_SERVICEABILITY: parsed.data.STOREFRONT_ENFORCE_SERVICEABILITY ?? false,
  SERVICEABILITY_COOKIE_SECRET:
    parsed.data.SERVICEABILITY_COOKIE_SECRET?.trim() ||
    (parsed.data.NODE_ENV === "production" ? "" : parsed.data.JWT_SECRET),
  STOREFRONT_CATALOG_CACHE_TTL_SEC: parsed.data.STOREFRONT_CATALOG_CACHE_TTL_SEC ?? 60,
  STOREFRONT_PROMO_CACHE_TTL_SEC:
    parsed.data.STOREFRONT_PROMO_CACHE_TTL_SEC > 0
      ? parsed.data.STOREFRONT_PROMO_CACHE_TTL_SEC
      : parsed.data.STOREFRONT_CATALOG_CACHE_TTL_SEC ?? 60,
  SHOP_RESOLVE_CACHE_TTL_SEC: parsed.data.SHOP_RESOLVE_CACHE_TTL_SEC ?? 300,
  SHOP_SERVICE_AREA_CACHE_TTL_SEC: parsed.data.SHOP_SERVICE_AREA_CACHE_TTL_SEC ?? 180,
  STOREFRONT_CATALOG_HTTP_CACHE_SEC: parsed.data.STOREFRONT_CATALOG_HTTP_CACHE_SEC ?? 0,
  CATALOG_CACHE_INVALIDATE_TOKEN: parsed.data.CATALOG_CACHE_INVALIDATE_TOKEN?.trim() || "",
  METRICS_SCRAPE_TOKEN: parsed.data.METRICS_SCRAPE_TOKEN?.trim() || "",
  OUTBOX_BATCH_SIZE: parsed.data.OUTBOX_BATCH_SIZE ?? 50,
  OUTBOX_POLL_INTERVAL_MS: parsed.data.OUTBOX_POLL_INTERVAL_MS ?? 1000,
  OUTBOX_MAX_RETRIES: parsed.data.OUTBOX_MAX_RETRIES ?? 5,
  OUTBOX_RETRY_BASE_MS: parsed.data.OUTBOX_RETRY_BASE_MS ?? 250,
  OUTBOX_RETRY_MAX_MS: parsed.data.OUTBOX_RETRY_MAX_MS ?? 30000,
  OUTBOX_HANDLER_TIMEOUT_MS: parsed.data.OUTBOX_HANDLER_TIMEOUT_MS ?? 10000,
  RETRY_ATTEMPTS: parsed.data.RETRY_ATTEMPTS ?? 3,
  RETRY_BASE_DELAY_MS: parsed.data.RETRY_BASE_DELAY_MS ?? 120,
  RETRY_MAX_DELAY_MS: parsed.data.RETRY_MAX_DELAY_MS ?? 1500,
  SERVER_DB_RETRY_ATTEMPTS: parsed.data.SERVER_DB_RETRY_ATTEMPTS ?? 8,
  SERVER_DB_RETRY_BASE_DELAY_MS: parsed.data.SERVER_DB_RETRY_BASE_DELAY_MS ?? 400,
  SERVER_DB_RETRY_MAX_DELAY_MS: parsed.data.SERVER_DB_RETRY_MAX_DELAY_MS ?? 5000,
  SERVER_START_RETRY_ATTEMPTS: parsed.data.SERVER_START_RETRY_ATTEMPTS ?? 5,
  SERVER_START_RETRY_BASE_DELAY_MS: parsed.data.SERVER_START_RETRY_BASE_DELAY_MS ?? 500,
  SERVER_START_RETRY_MAX_DELAY_MS: parsed.data.SERVER_START_RETRY_MAX_DELAY_MS ?? 6000,
  SHUTDOWN_TIMEOUT_MS: parsed.data.SHUTDOWN_TIMEOUT_MS ?? 30_000,
  SENTRY_DSN: parsed.data.SENTRY_DSN?.trim() || "",
  SENTRY_TRACES_SAMPLE_RATE: parsed.data.SENTRY_TRACES_SAMPLE_RATE ?? 0,
  ACCESS_JTI_REDIS_REQUIRED:
    parsed.data.NODE_ENV === "production"
      ? process.env.ACCESS_JTI_REDIS_REQUIRED === "false"
        ? false
        : true
      : parsed.data.ACCESS_JTI_REDIS_REQUIRED ?? false,
  ACCESS_JTI_DB_FALLBACK_ENABLED: parsed.data.ACCESS_JTI_DB_FALLBACK_ENABLED ?? true,
  REALTIME_ENABLED: parsed.data.REALTIME_ENABLED ?? false,
  REALTIME_CONNECT_TOKEN: parsed.data.REALTIME_CONNECT_TOKEN?.trim() || "",
  SEARCH_USE_TRGM: parsed.data.SEARCH_USE_TRGM ?? false
};

