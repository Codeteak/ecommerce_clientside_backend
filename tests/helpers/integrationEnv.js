import { describe } from "vitest";

export const integrationEnabled =
  (process.env.RUN_INTEGRATION_TESTS === "true" || process.env.RUN_INTEGRATION_TESTS === "1") &&
  Boolean(process.env.INTEGRATION_DATABASE_URL && process.env.INTEGRATION_REDIS_URL);

export function integrationDescribe(name, fn) {
  const run = integrationEnabled ? describe : describe.skip;
  return run(name, fn);
}

export const defaultIntegrationDbUrl =
  process.env.INTEGRATION_DATABASE_URL ||
  "postgresql://postgres:test@127.0.0.1:5433/ecommerce_test";

export const defaultIntegrationRedisUrl =
  process.env.INTEGRATION_REDIS_URL || "redis://127.0.0.1:6380";
