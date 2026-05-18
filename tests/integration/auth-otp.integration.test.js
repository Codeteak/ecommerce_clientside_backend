import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createRequestCustomerOtp } from "../../src/application/services/auth/requestCustomerOtp.js";
import { createVerifyCustomerOtp } from "../../src/application/services/auth/verifyCustomerOtp.js";
import { CustomerAuthRepoPg } from "../../src/adapters/repositories/postgres/CustomerAuthRepoPg.js";
import {
  defaultIntegrationDbUrl,
  integrationDescribe
} from "../helpers/integrationEnv.js";

const shopId = "c0000001-0000-4000-8000-000000000001";
const phone = "9876543210";

integrationDescribe("integration: customer OTP auth", () => {
  /** @type {import("pg").Pool} */
  let pool;
  /** @type {ReturnType<typeof createRequestCustomerOtp>} */
  let requestOtp;
  /** @type {ReturnType<typeof createVerifyCustomerOtp>} */
  let verifyOtp;
  /** @type {string | null} */
  let lastSmsCode = null;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: defaultIntegrationDbUrl });
    const authRepo = new CustomerAuthRepoPg();

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO shops (id, public_id, slug, name, status, is_active, is_blocked, is_deleted)
         VALUES ($1, $2, $3, $4, 'active', true, false, false)
         ON CONFLICT (id) DO NOTHING`,
        [shopId, "fixture-shop", "fixture-shop", "Integration Test Shop"]
      );
    } finally {
      client.release();
    }

    const smsSender = {
      sendOtp: vi.fn(async ({ code }) => {
        lastSmsCode = code;
      })
    };

    requestOtp = createRequestCustomerOtp({
      authRepo,
      smsSender,
      otpResendSeconds: 0
    });

    verifyOtp = createVerifyCustomerOtp({ authRepo });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("requests and verifies OTP against Postgres", async () => {
    const client = await pool.connect();
    try {
      const reqOut = await requestOtp(client, { phone: `+91${phone}`, shopId });
      expect(reqOut.ok).toBe(true);
      expect(lastSmsCode).toMatch(/^\d{6}$/);

      const verifyOut = await verifyOtp(client, {
        phone: `+91${phone}`,
        shopId,
        code: lastSmsCode,
        ip: "127.0.0.1",
        userAgent: "integration-test"
      });

      expect(verifyOut.accessToken).toBeTruthy();
      expect(verifyOut.refreshToken).toBeTruthy();
      expect(verifyOut.customerId).toBeTruthy();
      expect(verifyOut.userId).toBeTruthy();
    } finally {
      client.release();
    }
  });

  it("rejects wrong OTP code", async () => {
    const client = await pool.connect();
    try {
      await requestOtp(client, { phone: `+91${phone}`, shopId });
      const badCode = lastSmsCode === "000000" ? "111111" : "000000";
      await expect(
        verifyOtp(client, {
          phone: `+91${phone}`,
          shopId,
          code: badCode,
          ip: "127.0.0.1",
          userAgent: "integration-test"
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    } finally {
      client.release();
    }
  });
});
