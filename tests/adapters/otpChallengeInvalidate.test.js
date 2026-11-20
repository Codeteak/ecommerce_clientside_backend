import { describe, it, expect, vi } from "vitest";
import { CustomerAuthRepoPg } from "../../src/adapters/repositories/postgres/auth/CustomerAuthRepoPg.js";

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
    expect(String(client.query.mock.calls[0][0])).toMatch(/phone = \$1/);
    expect(String(client.query.mock.calls[0][0])).toMatch(/consumed_at IS NULL/);
    expect(String(client.query.mock.calls[1][0])).toMatch(/INSERT INTO customer_otp_challenges/);
  });

  it("loads OTP request gate (latest + window count) in one query", async () => {
    const repo = new CustomerAuthRepoPg();
    const latest = {
      id: "otp-1",
      phone: "9999999999",
      shop_id: shopId,
      code_hash: "hash",
      attempts: 0,
      consumed_at: null,
      expires_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ latest, sent_count: 2 }]
      })
    };

    const out = await repo.getOtpRequestGate(
      client,
      "9999999999",
      shopId,
      new Date(Date.now() - 900_000).toISOString()
    );

    expect(out).toEqual({ latestChallenge: latest, sentCountInWindow: 2 });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(client.query.mock.calls[0][0])).toMatch(/to_jsonb/);
    expect(String(client.query.mock.calls[0][0])).toMatch(/phone = \$1/);
  });
});
