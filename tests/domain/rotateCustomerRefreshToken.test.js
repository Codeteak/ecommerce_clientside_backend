import { describe, it, expect, vi } from "vitest";
import { createRotateCustomerRefreshToken } from "../../src/application/services/auth/rotateCustomerRefreshToken.js";

vi.mock("../../src/infra/auth/jwt.js", () => ({
  verifyCustomerRefreshToken: vi.fn(() => ({
    sub: "u-1",
    customerId: "c-1",
    exp: Math.floor(Date.now() / 1000) + 3600
  })),
  signCustomerAccessToken: vi.fn(() => ({ token: "new-access", jti: "access-jti-1" })),
  signCustomerRefreshToken: vi.fn(() => ({ token: "new-refresh", jti: "jti-2" }))
}));

vi.mock("../../src/infra/security/tokenHash.js", () => ({
  hashToken: vi.fn((t) => `hash:${t}`)
}));

describe("rotateCustomerRefreshToken", () => {
  it("revokes all refresh tokens when a consumed token is reused", async () => {
    const authRepo = {
      consumeRefreshToken: vi.fn().mockResolvedValue(null),
      findRefreshTokenByHash: vi.fn().mockResolvedValue({
        user_id: "u-1",
        consumed_at: new Date().toISOString()
      }),
      revokeAllRefreshTokensForUser: vi.fn().mockResolvedValue(undefined),
      insertRefreshToken: vi.fn()
    };
    const accessTokenRegistry = {
      revokeAllAccessForUser: vi.fn().mockResolvedValue(true)
    };
    const run = createRotateCustomerRefreshToken({ authRepo, accessTokenRegistry });

    await expect(
      run({}, { refreshToken: "stolen-refresh", ip: null, userAgent: null })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(authRepo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith({}, "u-1");
    expect(accessTokenRegistry.revokeAllAccessForUser).toHaveBeenCalledWith("u-1");
    expect(authRepo.insertRefreshToken).not.toHaveBeenCalled();
  });
});
