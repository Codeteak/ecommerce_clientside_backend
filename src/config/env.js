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
          CORS_ORIGIN: "http://localhost:5173",
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
          GOOGLE_OAUTH_SCOPE: "openid email profile"
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
    src.ALLOW_EMAIL_ONLY_JWT_EXCHANGE = "false";
  }

  if (nodeEnv === "development") {
    src.JWT_SECRET ??= "dev_only_change_me_please";
  }

  return src;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive(),
    CORS_ORIGIN: z.string().min(1),
    API_PUBLIC_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

    GOOGLE_OAUTH_AUTH_URL: z.string().url(),
    GOOGLE_OAUTH_TOKEN_URL: z.string().url(),
    GOOGLE_OAUTH_USERINFO_URL: z.string().url(),
    GOOGLE_OAUTH_SCOPE: z.string().min(1),

    DATABASE_URL: z.string().min(1),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),

    JWT_SECRET: z.string().min(16),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    JWT_EXPIRES_IN: z.string().min(1),

    SERVICE_AREA_RADIUS_METERS: z.coerce.number().int().positive(),

    ALLOW_EMAIL_ONLY_JWT_EXCHANGE: z.preprocess((val) => {
      if (val === true || val === 1) return true;
      if (val === false || val === 0) return false;
      if (val === undefined || val === null || val === "") return false;
      const s = String(val).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean()),

    STOREFRONT_ROOT_DOMAIN: z.string().optional().default(""),

    REDIS_URL: z.string().optional().default(""),

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
    if (val.NODE_ENV === "production" && val.ALLOW_EMAIL_ONLY_JWT_EXCHANGE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALLOW_EMAIL_ONLY_JWT_EXCHANGE"],
        message: "ALLOW_EMAIL_ONLY_JWT_EXCHANGE must be false in production (insecure email-only JWT minting)"
      });
    }
    if (val.NODE_ENV === "production" && val.JWT_SECRET === "dev_only_change_me_please") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be set to a strong secret in production (not the development default)"
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
  REDIS_URL: parsed.data.REDIS_URL?.trim() || "",
  STOREFRONT_DELIVERY_FEE_MINOR: parsed.data.STOREFRONT_DELIVERY_FEE_MINOR ?? 0,
  STOREFRONT_ENFORCE_SERVICEABILITY: parsed.data.STOREFRONT_ENFORCE_SERVICEABILITY ?? false
};
