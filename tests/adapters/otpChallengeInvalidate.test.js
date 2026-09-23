import { describe, it, expect, vi } from "vitest";
import { CustomerAuthRepoPg } from "../../src/adapters/repositories/postgres/CustomerAuthRepoPg.js";

const shopId = "c0000001-0000-4000-8000-000000000001";

describe("CustomerAuthRepoPg OTP challenge hygiene", () => {
  it("invalidates open phone OTP challenges before inserting a new one", async () => {
    const repo = new CustomerAuthRepoPg();
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "otp-new",
              phone: "9999999999",
              shop_id: shopId,
              code_hash: "hash",
              attempts: 0,
              consumed_at: null,
              expires_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            }
          ]
        })
    };

    const out = await repo.insertOtpChallenge(client, {
      phone: "9999999999",
      shopId,
      codeHash: "hash",
      expiresAtIso: new Date().toISOString()
    });

    expect(out.id).toBe("otp-new");
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(String(client.query.mock.calls[0][0])).toMatch(/UPDATE customer_otp_challenges/);
    expect(String(client.query.mock.calls[0][0])).toMatch(/consumed_at IS NULL/);
    expect(String(client.query.mock.calls[1][0])).toMatch(/INSERT INTO customer_otp_challenges/);
  });

  it("invalidates open email OTP challenges before inserting a new one", async () => {
    const repo = new CustomerAuthRepoPg();
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "email-otp-new",
              email: "a@example.com",
              shop_id: shopId,
              code_hash: "hash",
              attempts: 0,
              consumed_at: null,
              expires_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            }
          ]
        })
    };

    const out = await repo.insertEmailOtpChallenge(client, {
      email: "a@example.com",
      shopId,
      codeHash: "hash",
      expiresAtIso: new Date().toISOString()
    });

    expect(out.id).toBe("email-otp-new");
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(String(client.query.mock.calls[0][0])).toMatch(/UPDATE customer_email_otp_challenges/);
    expect(String(client.query.mock.calls[1][0])).toMatch(/INSERT INTO customer_email_otp_challenges/);
  });
});
