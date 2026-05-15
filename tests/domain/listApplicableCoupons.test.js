import { describe, expect, it, vi } from "vitest";
import { createListApplicableCoupons } from "../../src/application/services/promotions/listApplicableCoupons.js";

/** @type {import("pg").PoolClient} */
const fakeClient = /** @type {any} */ ({});

function baseRow(overrides = {}) {
  return {
    id: "coupon-1",
    promotion_id: "promo-1",
    code_normalized: "SAVE10",
    starts_at: new Date("2025-01-01"),
    ends_at: new Date("2030-01-01"),
    min_subtotal_minor: null,
    first_order_only: false,
    new_customer_only: false,
    max_redemptions_total: null,
    max_redemptions_per_customer: null,
    promotion_name: "Winter",
    total_redemptions: 0,
    customer_redemptions: 0,
    promotion_rules_public: [
      { kind: "cart_percent_off", percentBps: 1000, amountMinor: null, minSubtotalMinor: null }
    ],
    ...overrides
  };
}

describe("createListApplicableCoupons", () => {
  it("returns empty coupons when promotions are paused", async () => {
    const list = createListApplicableCoupons({
      promotionRepo: {
        getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: true }),
        listEligibleCouponsWithUsage: vi.fn()
      },
      authRepo: { getCustomerCreatedAtById: vi.fn() },
      orderRepo: { countDeliveredOrdersForCustomer: vi.fn() }
    });
    const out = await list(fakeClient, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002"
    });
    expect(out.promotionsPaused).toBe(true);
    expect(out.coupons).toEqual([]);
  });

  it("omits first-order-only coupons when customer is not eligible", async () => {
    const list = createListApplicableCoupons({
      promotionRepo: {
        getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: false }),
        listEligibleCouponsWithUsage: vi.fn().mockResolvedValue([
          baseRow({ id: "a", code_normalized: "OK" }),
          baseRow({ id: "b", code_normalized: "FIRST", first_order_only: true })
        ])
      },
      authRepo: {
        getCustomerCreatedAtById: vi.fn().mockResolvedValue({
          created_at: new Date("2025-06-01T00:00:00.000Z")
        })
      },
      orderRepo: { countDeliveredOrdersForCustomer: vi.fn().mockResolvedValue(1) }
    });

    const out = await list(fakeClient, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      cartSubtotalMinor: 1000
    });
    expect(out.coupons).toHaveLength(1);
    expect(out.coupons[0].code).toBe("OK");
  });

  it("maps benefits and eligibility; onlyApplicable filters to applicable rows", async () => {
    const list = createListApplicableCoupons({
      promotionRepo: {
        getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: false }),
        listEligibleCouponsWithUsage: vi.fn().mockResolvedValue([
          baseRow({ id: "a", code_normalized: "OK", first_order_only: false }),
          baseRow({
            id: "b",
            code_normalized: "FIRST",
            first_order_only: true,
            promotion_rules_public: null
          })
        ])
      },
      authRepo: {
        getCustomerCreatedAtById: vi.fn().mockResolvedValue({
          created_at: new Date("2025-06-01T00:00:00.000Z")
        })
      },
      orderRepo: {
        countDeliveredOrdersForCustomer: vi.fn().mockResolvedValue(1)
      }
    });

    const all = await list(fakeClient, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      cartSubtotalMinor: 1000,
      onlyApplicable: false
    });
    expect(all.coupons).toHaveLength(1);
    expect(all.coupons[0].benefits).toEqual([{ kind: "cart_percent_off", percentBps: 1000 }]);
    expect(all.coupons[0].eligibility.applicable).toBe(true);

    const filtered = await list(fakeClient, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002",
      cartSubtotalMinor: 1000,
      onlyApplicable: true
    });
    expect(filtered.coupons).toHaveLength(1);
    expect(filtered.coupons[0].code).toBe("OK");
  });

  it("drops rows exhausted at total or per-customer redemption limits before mapping", async () => {
    const list = createListApplicableCoupons({
      promotionRepo: {
        getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: false }),
        listEligibleCouponsWithUsage: vi.fn().mockResolvedValue([
          baseRow({
            id: "gone-total",
            max_redemptions_total: 1,
            total_redemptions: 1
          }),
          baseRow({
            id: "gone-customer",
            max_redemptions_per_customer: 1,
            customer_redemptions: 1
          }),
          baseRow({ id: "keep", code_normalized: "KEEP" })
        ])
      },
      authRepo: {
        getCustomerCreatedAtById: vi.fn().mockResolvedValue({
          created_at: new Date("2025-06-01T00:00:00.000Z")
        })
      },
      orderRepo: { countDeliveredOrdersForCustomer: vi.fn().mockResolvedValue(0) }
    });

    const out = await list(fakeClient, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "00000000-0000-4000-8000-000000000002"
    });
    expect(out.coupons.map((c) => c.id)).toEqual(["keep"]);
  });
});
