import { describe, it, expect, vi } from "vitest";
import { createAssertCustomerShopAccess } from "../../src/application/services/auth/assertCustomerShopAccess.js";
import { ForbiddenError } from "../../src/domain/errors/ForbiddenError.js";

const shopId = "c0000001-0000-4000-8000-000000000001";
const customerId = "d0000001-0000-4000-8000-000000000002";

describe("assertCustomerShopAccess", () => {
  it("allows active membership on an active shop", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue({
        membership: { is_active: true, is_blocked: false, is_deleted: false },
        shop: { status: "active" }
      })
    };
    const assert = createAssertCustomerShopAccess({ authRepo });
    await expect(assert({}, shopId, customerId)).resolves.toBeUndefined();
  });

  it("rejects missing membership", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue(null)
    };
    const assert = createAssertCustomerShopAccess({ authRepo });
    await expect(assert({}, shopId, customerId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects blocked membership", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue({
        membership: { is_active: true, is_blocked: true, is_deleted: false },
        shop: { status: "active" }
      })
    };
    const assert = createAssertCustomerShopAccess({ authRepo });
    await expect(assert({}, shopId, customerId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects blocked shop even when membership is active", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue({
        membership: { is_active: true, is_blocked: false, is_deleted: false },
        shop: { status: "blocked" }
      })
    };
    const assert = createAssertCustomerShopAccess({ authRepo });
    await expect(assert({}, shopId, customerId)).rejects.toMatchObject({
      code: "SHOP_BLOCKED",
      statusCode: 403
    });
  });

  it("rejects deleted shop", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue({
        membership: { is_active: true, is_blocked: false, is_deleted: false },
        shop: { status: "deleted" }
      })
    };
    const assert = createAssertCustomerShopAccess({ authRepo });
    await expect(assert({}, shopId, customerId)).rejects.toMatchObject({
      code: "SHOP_DELETED",
      statusCode: 403
    });
  });
});
