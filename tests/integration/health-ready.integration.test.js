import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import Redis from "ioredis";
import {
  defaultIntegrationDbUrl,
  defaultIntegrationRedisUrl,
  integrationDescribe
} from "../helpers/integrationEnv.js";

integrationDescribe("integration: health dependencies", () => {
  /** @type {import("pg").Pool} */
  let pool;
  /** @type {import("ioredis").default} */
  let redis;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: defaultIntegrationDbUrl });
    redis = new Redis(defaultIntegrationRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis?.quit();
    await pool?.end();
  });

  it("PostgreSQL accepts connections", async () => {
    const { rows } = await pool.query("select 1 as ok");
    expect(rows[0].ok).toBe(1);
  });

  it("Redis responds to PING", async () => {
    expect(await redis.ping()).toBe("PONG");
  });
});
