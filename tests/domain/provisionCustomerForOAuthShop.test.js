import { describe, it, expect, vi } from "vitest";
import { provisionCustomerForOAuthShop } from "../../src/application/services/auth/provisionCustomerForOAuthShop.js";

const shopId = "c0000001-0000-4000-8000-000000000001";

function activeShop() {
  return {
    id: shopId,
    status: "active",
    is_active: true,
    is_blocked: false,
    is_deleted: false
  };
}

describe("provisionCustomerForOAuthShop", () => {
  it("provisions customer when email belongs to active shop staff with existing customer", async () => {
    const authRepo = {
      getUserByEmail: vi.fn().mockResolvedValue({
        id: "u-staff-1",
        email: "owner@example.com",
        is_active: true
      }),
      getCustomerByUserId: vi.fn().mockResolvedValue({
        id: "c-staff-1",
        user_id: "u-staff-1",
        is_blocked: false,
        is_deleted: false
      }),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      upsertCustomerShopMembership: vi.fn().mockResolvedValue({
        id: "m-1",
        shop_id: shopId,
        customer_id: "c-staff-1",
        is_active: true,
        is_blocked: false,
        is_deleted: false
      })
    };
    const run = provisionCustomerForOAuthShop({ authRepo });
    const out = await run({}, { email: "owner@example.com", displayName: "Owner", shopId });
    expect(out.user.id).toBe("u-staff-1");
    expect(out.customer.id).toBe("c-staff-1");
    expect(out.shop.id).toBe(shopId);
  });

  it("provisions customer when user is active shop staff", async () => {
    const authRepo = {
      getUserByEmail: vi.fn().mockResolvedValue({
        id: "u-staff-2",
        email: "picker@example.com",
        is_active: true
      }),
      getCustomerByUserId: vi.fn().mockResolvedValue({
        id: "c-staff-2",
        user_id: "u-staff-2",
        display_name: "Picker",
        is_blocked: false,
        is_deleted: false
      }),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      upsertCustomerShopMembership: vi.fn().mockResolvedValue({
        id: "m-2",
        shop_id: shopId,
        customer_id: "c-staff-2",
        is_active: true,
        is_blocked: false,
        is_deleted: false
      })
    };
    const run = provisionCustomerForOAuthShop({ authRepo });
    const out = await run({}, { email: "picker@example.com", displayName: "Picker", shopId });
    expect(out.user.id).toBe("u-staff-2");
    expect(out.customer.id).toBe("c-staff-2");
  });

  it("provisions customer when user is not staff", async () => {
    const authRepo = {
      getUserByEmail: vi.fn().mockResolvedValue({
        id: "u-2",
        email: "customer@example.com",
        is_active: true
      }),
      getCustomerByUserId: vi.fn().mockResolvedValue({
        id: "c-2",
        user_id: "u-2",
        is_blocked: false,
        is_deleted: false
      }),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      upsertCustomerShopMembership: vi.fn().mockResolvedValue({
        id: "m-2",
        shop_id: shopId,
        customer_id: "c-2",
        is_active: true,
        is_blocked: false,
        is_deleted: false
      })
    };
    const run = provisionCustomerForOAuthShop({ authRepo });
    const out = await run({}, { email: "customer@example.com", displayName: "Customer", shopId });
    expect(out.user.id).toBe("u-2");
    expect(out.customer.id).toBe("c-2");
    expect(out.shop.id).toBe(shopId);
    expect(authRepo.upsertCustomerShopMembership).toHaveBeenCalledWith(
      {},
      { shop_id: shopId, customer_id: "c-2" }
    );
  });

  it("rejects OAuth shop provisioning when membership is blocked", async () => {
    const authRepo = {
      getUserByEmail: vi.fn().mockResolvedValue({
        id: "u-2",
        email: "customer@example.com",
        is_active: true
      }),
      getCustomerByUserId: vi.fn().mockResolvedValue({
        id: "c-2",
        user_id: "u-2",
        is_blocked: false,
        is_deleted: false
      }),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      upsertCustomerShopMembership: vi.fn().mockResolvedValue({
        id: "m-2",
        is_active: true,
        is_blocked: true,
        is_deleted: false
      })
    };
    const run = provisionCustomerForOAuthShop({ authRepo });
    await expect(
      run({}, { email: "customer@example.com", displayName: "Customer", shopId })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
