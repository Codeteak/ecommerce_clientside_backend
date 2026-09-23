import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromotionRepoPg } from "../../src/adapters/repositories/postgres/PromotionRepoPg.js";

vi.mock("../../src/infra/db/tenantContext.js", () => ({
  setTenantContext: vi.fn().mockResolvedValue(undefined)
}));

const shopId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const customerId = "cust-1";
const couponId = "00000000-0000-4000-8000-000000000003";
const promotionId = "00000000-0000-4000-8000-000000000004";

describe("PromotionRepoPg.insertPromotionRedemption", () => {
  /** @type {PromotionRepoPg} */
  let repo;

  beforeEach(() => {
    repo = new PromotionRepoPg();
  });

  it("locks coupon and inserts when under caps", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: couponId, max_redemptions_total: 10, max_redemptions_per_customer: 2 }]
        })
        .mockResolvedValueOnce({
          rows: [{ total_redemptions: 3, customer_redemptions: 0 }]
        })
        .mockResolvedValueOnce({ rows: [] })
    };

    await repo.insertPromotionRedemption(client, {
      shopId,
      orderId,
      customerId,
      promotionId,
      couponId,
      discountMinor: 100
    });

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(String(client.query.mock.calls[0][0])).toMatch(/FOR UPDATE/);
    expect(String(client.query.mock.calls[2][0])).toMatch(/INSERT INTO promotion_redemptions/);
  });

  it("rejects when total redemption cap is reached under lock", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: couponId, max_redemptions_total: 5, max_redemptions_per_customer: null }]
        })
        .mockResolvedValueOnce({
          rows: [{ total_redemptions: 5, customer_redemptions: 1 }]
        })
    };

    await expect(
      repo.insertPromotionRedemption(client, {
        shopId,
        orderId,
        customerId,
        promotionId,
        couponId,
        discountMinor: 50
      })
    ).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" });

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects when per-customer cap is reached under lock", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: couponId, max_redemptions_total: null, max_redemptions_per_customer: 1 }]
        })
        .mockResolvedValueOnce({
          rows: [{ total_redemptions: 3, customer_redemptions: 1 }]
        })
    };

    await expect(
      repo.insertPromotionRedemption(client, {
        shopId,
        orderId,
        customerId,
        promotionId,
        couponId,
        discountMinor: 50
      })
    ).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" });
  });

  it("skips coupon lock when redemption has no couponId (auto promo)", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    await repo.insertPromotionRedemption(client, {
      shopId,
      orderId,
      customerId,
      promotionId,
      couponId: null,
      discountMinor: 25
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(String(client.query.mock.calls[0][0])).toMatch(/INSERT INTO promotion_redemptions/);
  });
});
