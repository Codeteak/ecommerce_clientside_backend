import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequireCustomerJwt } from "../../src/interface/http/middleware/requireCustomerJwt.js";

vi.mock("../../src/infra/auth/jwt.js", () => ({
  verifyCustomerAccessToken: vi.fn(() => ({
    sub: "u-1",
    customerId: "c-1",
    jti: "jti-1",
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

  it("falls back to DB session validation when access jti is missing and fallback is enabled", async () => {
    const accessTokenRegistry = {
      getAccessJtiStatus: vi.fn().mockResolvedValue({
        active: false,
        reason: "jti_missing"
      })
    };
    const authRepo = {
      isCustomerSessionValid: vi.fn().mockResolvedValue(true)
    };
    const middleware = createRequireCustomerJwt({
      authRepo,
      accessTokenRegistry,
      skipDbSessionCheck: false,
      allowJtiDbFallback: true,
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

    expect(accessTokenRegistry.getAccessJtiStatus).toHaveBeenCalledWith("jti-1");
    expect(authRepo.isCustomerSessionValid).toHaveBeenCalledWith("u-1", "c-1");
    expect(next).toHaveBeenCalled();
    expect(req.customerAuth).toMatchObject({ userId: "u-1", customerId: "c-1" });
  });

  it("rejects inactive access jti when fallback is disabled", async () => {
    const accessTokenRegistry = {
      getAccessJtiStatus: vi.fn().mockResolvedValue({
        active: false,
        reason: "jti_missing"
      })
    };
    const authRepo = {
      isCustomerSessionValid: vi.fn()
    };
    const middleware = createRequireCustomerJwt({
      authRepo,
      accessTokenRegistry,
      skipDbSessionCheck: false,
      allowJtiDbFallback: false,
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

    expect(authRepo.isCustomerSessionValid).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
