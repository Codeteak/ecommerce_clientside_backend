import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createCheckoutStorefront } from "../../src/application/services/checkout/checkoutStorefront.js";
import { CartRepoPg } from "../../src/adapters/repositories/postgres/CartRepoPg.js";
import { OrderRepoPg } from "../../src/adapters/repositories/postgres/OrderRepoPg.js";
import { CustomerAuthRepoPg } from "../../src/adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { defaultIntegrationDbUrl, integrationDescribe } from "../helpers/integrationEnv.js";

const shopId = "c0000001-0000-4000-8000-000000000001";

integrationDescribe("integration: checkout idempotency", () => {
  /** @type {import("pg").Pool} */
  let pool;
  /** @type {ReturnType<typeof createCheckoutStorefront>} */
  let checkout;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: defaultIntegrationDbUrl });
    const cartRepo = new CartRepoPg();
    const orderRepo = new OrderRepoPg();
    const authRepo = new CustomerAuthRepoPg();

    checkout = createCheckoutStorefront({
      cartRepo,
      orderRepo,
      authRepo,
      checkShopServiceArea: vi.fn().mockResolvedValue({ inServiceArea: true }),
      deliveryFeeMinor: 0,
      priceStorefrontLines: null,
      promotionRepo: null,
      emitOrderPlaced: null
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects invalid idempotency key before cart lookup", async () => {
    const client = await pool.connect();
    try {
      await expect(
        checkout(client, {
          shopId,
          customerId: "00000000-0000-4000-8000-000000000099",
          userId: "00000000-0000-4000-8000-000000000098",
          idempotencyKey: "short",
          requestMeta: { requestId: "integration-checkout-1" }
        })
      ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    } finally {
      client.release();
    }
  });
});
