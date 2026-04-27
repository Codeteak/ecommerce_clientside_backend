import { z } from "zod";

function boolFromEnv(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (val === undefined || val === null || val === "") return false;
  const s = String(val).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive(),
    CORS_ORIGIN: z
      .string()
      .min(1)
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      )
      .pipe(z.array(z.string().url()).min(1)),
    API_PUBLIC_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
    GOOGLE_OAUTH_AUTH_URL: z.string().url(),
    GOOGLE_OAUTH_TOKEN_URL: z.string().url(),
    GOOGLE_OAUTH_USERINFO_URL: z.string().url(),
    GOOGLE_OAUTH_SCOPE: z.string().min(1),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_REQUEST_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    OTP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(5),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOG_OTP_IN_DEV: z.preprocess(boolFromEnv, z.boolean()),
    SMTP_HOST: z.string().optional().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional().default(""),
    SMTP_PASS: z.string().optional().default(""),
    SMTP_SECURE: z.preprocess(boolFromEnv, z.boolean()),
    OTP_FROM_EMAIL: z.string().optional().default(""),
    DISABLE_RATE_LIMITING: z.preprocess(boolFromEnv, z.boolean()),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
    DATABASE_POOL_MAX_DEV: z.coerce.number().int().positive().default(12),
    DATABASE_POOL_MAX_TEST: z.coerce.number().int().positive().default(4),
    DATABASE_POOL_MAX_PROD: z.coerce.number().int().positive().default(30),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.preprocess(boolFromEnv, z.boolean()),
    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_PREVIOUS_SECRET: z.string().optional().default(""),
    JWT_PREVIOUS_REFRESH_SECRET: z.string().optional().default(""),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    JWT_EXPIRES_IN: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.string().min(1).default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("30d"),
    JWT_KEY_ID: z.string().min(1).default("v1"),
    JWT_ALLOWED_ALGORITHMS: z
      .string()
      .min(1)
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      )
      .pipe(z.array(z.string().min(1)).min(1)),
    ENABLE_API_DOCS: z.preprocess(boolFromEnv, z.boolean()),
    ALLOW_API_DOCS_IN_PRODUCTION: z.preprocess(boolFromEnv, z.boolean()),
    TRUST_PROXY: z.preprocess(boolFromEnv, z.boolean()),
    TRUST_PROXY_HOPS: z.coerce.number().int().positive().default(1),
    SERVICE_AREA_RADIUS_METERS: z.coerce.number().int().positive().default(5000),
    STOREFRONT_ROOT_DOMAIN: z.string().optional().default(""),
    OBJECT_STORAGE_PUBLIC_BASE_URL: z.string().optional().default(""),
    REDIS_URL: z.string().optional().default(""),
    CUSTOMER_SESSION_CHECK_CACHE_MS: z.coerce.number().int().nonnegative().default(0),
    STOREFRONT_DELIVERY_FEE_MINOR: z.coerce.number().int().nonnegative().optional().default(0),
    STOREFRONT_ENFORCE_SERVICEABILITY: z.preprocess(boolFromEnv, z.boolean()),
    STOREFRONT_CATALOG_CACHE_TTL_SEC: z.coerce.number().int().min(0).max(86_400).default(60),
    STOREFRONT_CATALOG_HTTP_CACHE_SEC: z.coerce.number().int().min(0).max(86_400).default(0),
    CATALOG_CACHE_INVALIDATE_TOKEN: z.string().optional().default(""),
    METRICS_SCRAPE_TOKEN: z.string().optional().default(""),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(1000).default(50),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    OUTBOX_MAX_RETRIES: z.coerce.number().int().positive().default(5),
    OUTBOX_RETRY_BASE_MS: z.coerce.number().int().positive().default(250),
    OUTBOX_RETRY_MAX_MS: z.coerce.number().int().positive().default(30_000),
    OUTBOX_HANDLER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
    RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(120),
    RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(1500),
    SERVER_DB_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(8),
    SERVER_DB_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(400),
    SERVER_DB_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(5000),
    SERVER_START_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(5),
    SERVER_START_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
    SERVER_START_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(6000)
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production" && !val.DATABASE_URL?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production"
      });
    }
    if (val.NODE_ENV === "production" && val.JWT_SECRET === "dev_only_change_me_please") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be set to a strong secret in production (not the development default)"
      });
    }
    if (val.NODE_ENV === "production" && val.JWT_REFRESH_SECRET === "dev_refresh_only_change_me") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message:
          "JWT_REFRESH_SECRET must be set to a strong secret in production (not the development default)"
      });
    }
    if (val.NODE_ENV === "production" && !val.DATABASE_SSL_REJECT_UNAUTHORIZED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_SSL_REJECT_UNAUTHORIZED"],
        message: "DATABASE_SSL_REJECT_UNAUTHORIZED must be true in production"
      });
    }
    if (val.NODE_ENV === "production" && val.LOG_OTP_IN_DEV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LOG_OTP_IN_DEV"],
        message: "LOG_OTP_IN_DEV must be false in production"
      });
    }
    if (val.NODE_ENV === "production" && val.ENABLE_API_DOCS && !val.ALLOW_API_DOCS_IN_PRODUCTION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_API_DOCS"],
        message:
          "ENABLE_API_DOCS is blocked in production unless ALLOW_API_DOCS_IN_PRODUCTION=true"
      });
    }
    if (val.NODE_ENV === "production" && !val.TRUST_PROXY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message:
          "TRUST_PROXY must be true in production behind a reverse proxy so req.ip and rate limiting are reliable"
      });
    }
    if (val.NODE_ENV === "production" && val.DISABLE_RATE_LIMITING) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DISABLE_RATE_LIMITING"],
        message: "DISABLE_RATE_LIMITING must be false in production"
      });
    }
    if (val.SMTP_HOST) {
      if (!val.SMTP_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SMTP_USER"],
          message: "SMTP_USER is required when SMTP_HOST is set"
        });
      }
      if (!val.SMTP_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SMTP_PASS"],
          message: "SMTP_PASS is required when SMTP_HOST is set"
        });
      }
      if (!val.OTP_FROM_EMAIL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OTP_FROM_EMAIL"],
          message: "OTP_FROM_EMAIL is required when SMTP_HOST is set"
        });
      }
    }
  });

