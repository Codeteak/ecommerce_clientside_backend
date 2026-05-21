import { describe } from "vitest";

export const integrationEnabled =
  (process.env.RUN_INTEGRATION_TESTS === "true" || process.env.RUN_INTEGRATION_TESTS === "1") &&
  Boolean(process.env.INTEGRATION_DATABASE_URL && process.env.INTEGRATION_REDIS_URL);

export function integrationDescribe(name, fn) {
  const run = integrationEnabled ? describe : describe.skip;
  return run(name, fn);
}

/** Set INTEGRATION_DATABASE_URL / INTEGRATION_REDIS_URL when running integration tests locally. */
export const defaultIntegrationDbUrl = process.env.INTEGRATION_DATABASE_URL || "";
export const defaultIntegrationRedisUrl = process.env.INTEGRATION_REDIS_URL || "";
