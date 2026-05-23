import { describe, it, expect } from "vitest";
import { envSchema } from "../../src/config/env/schema.js";

const baseProductionEnv = {
  NODE_ENV: "production",
  PORT: 4100,
  CORS_ORIGIN: "https://example.com",
  API_PUBLIC_URL: "https://api.example.com",
  DATABASE_URL: "postgresql://localhost:5432/postgres",
  JWT_SECRET: "production_jwt_secret_16",
  JWT_REFRESH_SECRET: "production_refresh_secret_16",
  JWT_ISSUER: "clientside-ecommerce",
  JWT_AUDIENCE: "clientside-ecommerce",
  JWT_EXPIRES_IN: "15m",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "30d",
  JWT_ALLOWED_ALGORITHMS: "HS256",
  LOG_OTP_IN_DEV: false,
  DISABLE_RATE_LIMITING: false,
  TRUST_PROXY: true,
  MSG_AUTH_KEY: "msg91-key",
  METRICS_SCRAPE_TOKEN: "metrics-token",
  SERVICEABILITY_COOKIE_SECRET: "serviceability_secret_16",
  REDIS_URL: "redis://127.0.0.1:6379",
  GOOGLE_OAUTH_AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  GOOGLE_OAUTH_TOKEN_URL: "https://oauth2.googleapis.com/token",
  GOOGLE_OAUTH_USERINFO_URL: "https://www.googleapis.com/oauth2/v3/userinfo",
  GOOGLE_OAUTH_SCOPE: "openid email profile",
  SMTP_SECURE: false,
  STOREFRONT_ENFORCE_SERVICEABILITY: true,
  DISABLE_CUSTOMER_AUTH: false,
  ENABLE_API_DOCS: false
};

describe("envSchema production", () => {
  it("rejects production when REDIS_URL is missing", () => {
    const { REDIS_URL: _removed, ...withoutRedis } = baseProductionEnv;
    const result = envSchema.safeParse(withoutRedis);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.REDIS_URL).toBeDefined();
    }
  });

  it("accepts production with REDIS_URL set", () => {
    const result = envSchema.safeParse(baseProductionEnv);
    expect(result.success).toBe(true);
  });
});
