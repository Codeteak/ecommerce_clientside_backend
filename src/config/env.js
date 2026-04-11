// Purpose: This file reads, validates, and exports environment settings used by the app.
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

function rawEnv() {
  const src = { ...process.env };
  const nodeEnv = src.NODE_ENV || "development";

  const devLikeDefaults =
    nodeEnv === "test" || nodeEnv === "development"
      ? {
          PORT: "4100",
          CORS_ORIGIN:
            [
              "http://localhost:5173",
              "http://localhost:3000",
              "http://localhost:3001",
              "http://localhost:3002",
              "http://localhost:3003",
              "http://localhost:3004",
              "http://localhost:3005"
            ].join(","),
          API_PUBLIC_URL: "http://localhost:4100",
          DATABASE_URL: "postgresql://localhost:5432/postgres",
          JWT_ISSUER: "clientside-ecommerce",
          JWT_AUDIENCE: "clientside-ecommerce",
          JWT_EXPIRES_IN: "8h",
          SERVICE_AREA_RADIUS_METERS: "5000",
          DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
          GOOGLE_OAUTH_AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
          GOOGLE_OAUTH_TOKEN_URL: "https://oauth2.googleapis.com/token",
          GOOGLE_OAUTH_USERINFO_URL: "https://www.googleapis.com/oauth2/v3/userinfo",
          GOOGLE_OAUTH_SCOPE: "openid email profile",
          OTP_TTL_SECONDS: "300",
          OTP_RESEND_SECONDS: "60",
          OTP_REQUEST_WINDOW_SECONDS: "900",
          OTP_MAX_REQUESTS_PER_WINDOW: "5",
          OTP_MAX_ATTEMPTS: "5",
          LOG_OTP_IN_DEV: "true",
          OBJECT_STORAGE_PUBLIC_BASE_URL: "",
          ENABLE_API_DOCS: "true",
          ALLOW_API_DOCS_IN_PRODUCTION: "false",
          TRUST_PROXY: "false",
          TRUST_PROXY_HOPS: "1",
          JWT_ACCESS_EXPIRES_IN: "15m",
          JWT_REFRESH_EXPIRES_IN: "30d",
          JWT_KEY_ID: "dev-v1",
          JWT_ALLOWED_ALGORITHMS: "HS256"
        }
      : null;

  if (devLikeDefaults) {
    for (const [k, v] of Object.entries(devLikeDefaults)) {
      if (src[k] === undefined || src[k] === "") {
        src[k] = v;
      }
    }
  }

  if (nodeEnv === "test") {
    src.JWT_SECRET ??= "test_jwt_secret_16_chars";
    src.JWT_REFRESH_SECRET ??= "test_jwt_refresh_secret_16_chars";
  }

  if (nodeEnv === "development") {
    src.JWT_SECRET ??= "dev_only_change_me_please";
    src.JWT_REFRESH_SECRET ??= "dev_refresh_only_change_me";
  }

  // Backward-compatible JWT TTL behavior:
  // if JWT_ACCESS_EXPIRES_IN is not set, inherit from JWT_EXPIRES_IN.
  if (src.JWT_ACCESS_EXPIRES_IN === undefined || src.JWT_ACCESS_EXPIRES_IN === "") {
    src.JWT_ACCESS_EXPIRES_IN = src.JWT_EXPIRES_IN || "15m";
  }

  return src;
}

const envSchema = z
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
    LOG_OTP_IN_DEV: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),

    DATABASE_URL: z.string().min(1),
    /** Max connections per Node process; size against DB max_connections and replica count. */
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    /** Close idle clients after this many ms (node-pg default 10000). */
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),
    /** Abort connect attempts after this many ms; 0 = no timeout (driver default). */
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),

    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
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
    ENABLE_API_DOCS: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),
    ALLOW_API_DOCS_IN_PRODUCTION: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),
    TRUST_PROXY: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),
    TRUST_PROXY_HOPS: z.coerce.number().int().positive().default(1),

    SERVICE_AREA_RADIUS_METERS: z.coerce.number().int().positive(),

    STOREFRONT_ROOT_DOMAIN: z.string().optional().default(""),
    OBJECT_STORAGE_PUBLIC_BASE_URL: z.string().optional().default(""),

    REDIS_URL: z.string().optional().default(""),

    /**
     * In-memory TTL cache for `isCustomerSessionValid` (ms). 0 = always hit DB.
     * Short values (e.g. 15000) reduce load; revocation may lag by up to this window.
     */
    CUSTOMER_SESSION_CHECK_CACHE_MS: z.coerce.number().int().nonnegative().default(0),

    STOREFRONT_DELIVERY_FEE_MINOR: z.coerce.number().int().nonnegative().optional().default(0),

    STOREFRONT_ENFORCE_SERVICEABILITY: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean())
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
  });

const parsed = envSchema.safeParse(rawEnv());
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const apiPublic = parsed.data.API_PUBLIC_URL.replace(/\/$/, "");

export const env = {
  ...parsed.data,
  API_PUBLIC_URL: apiPublic,
  DATABASE_URL: parsed.data.DATABASE_URL.trim(),
  STOREFRONT_ROOT_DOMAIN: parsed.data.STOREFRONT_ROOT_DOMAIN?.trim() || "",
  OBJECT_STORAGE_PUBLIC_BASE_URL: parsed.data.OBJECT_STORAGE_PUBLIC_BASE_URL?.trim() || "",
  REDIS_URL: parsed.data.REDIS_URL?.trim() || "",
  STOREFRONT_DELIVERY_FEE_MINOR: parsed.data.STOREFRONT_DELIVERY_FEE_MINOR ?? 0,
  STOREFRONT_ENFORCE_SERVICEABILITY: parsed.data.STOREFRONT_ENFORCE_SERVICEABILITY ?? false
};
