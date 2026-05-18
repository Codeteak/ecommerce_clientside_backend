import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequireCustomerJwt } from "../../src/interface/http/middleware/requireCustomerJwt.js";

vi.mock("../../src/infra/auth/jwt.js", () => ({
  verifyCustomerAccessToken: vi.fn(() => ({
    sub: "u-1",
    customerId: "c-1",
    exp: Math.floor(Date.now() / 1000) + 3600
  }))
}));

describe("requireCustomerJwt session cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not use session cache when shouldUseSessionCache is false", async () => {
    const sessionValidityCache = {
      get: vi.fn().mockResolvedValue(true),
      set: vi.fn()
    };
    const authRepo = {
      isCustomerSessionValid: vi.fn().mockResolvedValue(false)
    };
    const middleware = createRequireCustomerJwt({
      authRepo,
      skipDbSessionCheck: false,
      sessionValidityCache,
      shouldUseSessionCache: () => false
    })();

    const req = {
      headers: { authorization: "Bearer test-token" },
      method: "GET",
      path: "/storefront/cart"
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(sessionValidityCache.get).not.toHaveBeenCalled();
    expect(authRepo.isCustomerSessionValid).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
