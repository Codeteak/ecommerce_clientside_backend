import { describe, it, expect, vi } from "vitest";
import { createLogoutCustomer } from "../../src/application/services/auth/logoutCustomer.js";

vi.mock("../../src/infra/auth/jwt.js", () => ({
  verifyCustomerAccessToken: vi.fn((token) => {
    if (token === "bad-access") throw new Error("expired");
    return { sub: "u-1", jti: "access-jti-1", sid: "access-jti-1" };
  }),
  verifyCustomerRefreshToken: vi.fn((token) => {
    if (token === "bad-refresh") throw new Error("expired");
    return { sub: "u-1", customerId: "c-1", typ: "refresh", jti: "rt-1" };
  })
}));

describe("logoutCustomer", () => {
  it("revokes via access token when Bearer is valid", async () => {
    const authRepo = {
      revokeAllRefreshTokensForUser: vi.fn().mockResolvedValue(undefined)
    };
    const accessTokenRegistry = {
      revokeAccessJti: vi.fn().mockResolvedValue(true),
      revokeAllAccessForUser: vi.fn().mockResolvedValue(true)
    };
    const run = createLogoutCustomer({ authRepo, accessTokenRegistry });
    await expect(run({}, { accessToken: "good-access", refreshToken: null })).resolves.toEqual({
      ok: true
    });
    expect(accessTokenRegistry.revokeAccessJti).toHaveBeenCalledWith("access-jti-1", "u-1");
    expect(authRepo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith({}, "u-1");
    expect(accessTokenRegistry.revokeAllAccessForUser).toHaveBeenCalledWith("u-1");
  });

  it("falls back to refresh token when access JWT is expired", async () => {
    const authRepo = {
      revokeAllRefreshTokensForUser: vi.fn().mockResolvedValue(undefined)
    };
    const accessTokenRegistry = {
      revokeAccessJti: vi.fn().mockResolvedValue(true),
      revokeAllAccessForUser: vi.fn().mockResolvedValue(true)
    };
    const run = createLogoutCustomer({ authRepo, accessTokenRegistry });
    await expect(
      run({}, { accessToken: "bad-access", refreshToken: "good-refresh" })
    ).resolves.toEqual({ ok: true });
    expect(accessTokenRegistry.revokeAccessJti).not.toHaveBeenCalled();
    expect(authRepo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith({}, "u-1");
    expect(accessTokenRegistry.revokeAllAccessForUser).toHaveBeenCalledWith("u-1");
  });

  it("rejects when both access and refresh are missing/invalid", async () => {
    const run = createLogoutCustomer({
      authRepo: { revokeAllRefreshTokensForUser: vi.fn() },
      accessTokenRegistry: null
    });
    await expect(run({}, { accessToken: null, refreshToken: null })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
