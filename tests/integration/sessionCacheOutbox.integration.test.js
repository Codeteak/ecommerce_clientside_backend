import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import Redis from "ioredis";
import express from "express";
import request from "supertest";
import { createSessionCache } from "../../src/utils/sessionCache.js";
import { createRequireCustomerJwt } from "../../src/interface/http/middleware/requireCustomerJwt.js";
import { signCustomerAccessToken } from "../../src/infra/auth/jwt.js";
import { hashToken } from "../../src/infra/security/tokenHash.js";
import { processOutboxBatch } from "../../src/application/services/outboxProcessor.js";
import { createOutboxHandlers } from "../../src/application/services/outboxHandlers.js";
import { logger } from "../../src/config/logger.js";

const integrationEnabled =
  (process.env.RUN_INTEGRATION_TESTS === "true" || process.env.RUN_INTEGRATION_TESTS === "1") &&
  Boolean(process.env.INTEGRATION_DATABASE_URL && process.env.INTEGRATION_REDIS_URL);
const runDescribe = integrationEnabled ? describe : describe.skip;

runDescribe("integration: redis session cache and outbox processor", () => {
  let pool;
  let redis;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: process.env.INTEGRATION_DATABASE_URL
    });
    redis = new Redis(process.env.INTEGRATION_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    await redis.connect();
    await redis.flushdb();

    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      );
      ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
    `);
  }, 30000);

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
    if (pool) {
      await pool.end();
    }
  });

  it("stores and validates session in redis-backed middleware path", async () => {
    const sessionCache = createSessionCache({ redis });
    const token = signCustomerAccessToken({
      userId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222"
    });
    const sessionId = hashToken(token);
    await sessionCache.storeSession({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId,
      ttlMs: 60_000
    });

    const authRepo = {
      isCustomerSessionValid: vi.fn(async () => false)
    };
    const sessionValidityCache = {
      async get(key) {
        const [userId, sid] = key.split(":");
        return sessionCache.validateSession({ userId, sessionId: sid });
      },
      async set() {}
    };

    const middleware = createRequireCustomerJwt({
      authRepo,
      skipDbSessionCheck: false,
      sessionValidityCache
    })();

    const app = express();
    app.get("/secure", middleware, (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/secure").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(authRepo.isCustomerSessionValid).not.toHaveBeenCalled();
  });

  it("processes pending outbox events and marks completion", async () => {
    await pool.query("DELETE FROM outbox_messages");
    await pool.query(
      `INSERT INTO outbox_messages (event_type, payload_json, status, retry_count)
       VALUES ('ORDER_CREATED', '{"orderId":"o-1"}'::jsonb, 'pending', 0)`
    );

    const result = await processOutboxBatch({
      pool,
      handlers: createOutboxHandlers(),
      logger,
      batchSize: 10,
      maxRetries: 3,
      retryBaseMs: 1,
      retryMaxMs: 2,
      handlerTimeoutMs: 5000
    });

    const { rows } = await pool.query("SELECT status, retry_count, processed_at FROM outbox_messages LIMIT 1");
    expect(result.done).toBe(1);
    expect(rows[0].status).toBe("done");
    expect(Number(rows[0].retry_count)).toBe(0);
    expect(rows[0].processed_at).toBeTruthy();
  });
});
