import { describe, it, expect, vi } from "vitest";
import { createRequireCustomerShopAccess } from "../../src/interface/http/middleware/requireCustomerShopAccess.js";
import { ForbiddenError } from "../../src/domain/errors/ForbiddenError.js";

vi.mock("../../src/infra/db/tx.js", () => ({
  withClient: vi.fn((fn) => fn({}))
}));

const shopId = "c0000001-0000-4000-8000-000000000001";
const customerId = "d0000001-0000-4000-8000-000000000002";

function mockReq(overrides = {}) {
  return {
    shopId,
    customerAuth: { customerId, userId: "u-1" },
    ...overrides
  };
}

describe("requireCustomerShopAccess", () => {
  it("returns 403 when customer has no membership for shop", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue(null)
    };
    const middleware = createRequireCustomerShopAccess({ authRepo });
    const req = mockReq();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when membership is active", async () => {
    const authRepo = {
      getMembershipWithShopForCustomer: vi.fn().mockResolvedValue({
        membership: {
          is_active: true,
          is_blocked: false,
          is_deleted: false
        },
        shop: {
          status: "active",
          is_active: true,
          is_blocked: false,
          is_deleted: false
        }
      })
    };
    const middleware = createRequireCustomerShopAccess({ authRepo });
    const req = mockReq();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(next.mock.calls[0]).toHaveLength(0);
  });
});
