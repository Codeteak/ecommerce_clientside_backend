import { describe, it, expect, vi } from "vitest";
import { createRequestCustomerEmailOtp } from "../../src/application/services/auth/requestCustomerEmailOtp.js";
import { createVerifyCustomerEmailOtp } from "../../src/application/services/auth/verifyCustomerEmailOtp.js";
import { hashOtpCode } from "../../src/infra/security/otpHasher.js";

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

describe("customer email OTP auth", () => {
  it("requests email OTP and sends via OTP sender", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      findLatestEmailOtpChallenge: vi.fn().mockResolvedValue(null),
      countEmailOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertEmailOtpChallenge: vi.fn().mockResolvedValue({ id: "eotp-1" })
    };
    const otpSender = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    const run = createRequestCustomerEmailOtp({ authRepo, otpSender });

    const out = await run({}, { email: "  User@Example.com ", shopId });

    expect(out).toMatchObject({ ok: true });
    expect(authRepo.insertEmailOtpChallenge).toHaveBeenCalledTimes(1);
    const senderArg = otpSender.sendOtp.mock.calls[0][0];
    expect(senderArg.to).toBe("user@example.com");
    expect(String(senderArg.code)).toMatch(/^\d{6}$/);
  });

  it("consumes email OTP challenge when send fails", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      findLatestEmailOtpChallenge: vi.fn().mockResolvedValue(null),
      countEmailOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertEmailOtpChallenge: vi.fn().mockResolvedValue({ id: "eotp-fail-1" }),
      consumeEmailOtpChallenge: vi.fn().mockResolvedValue(undefined)
    };
    const otpSender = { sendOtp: vi.fn().mockRejectedValue(new Error("SMTP down")) };
    const run = createRequestCustomerEmailOtp({ authRepo, otpSender });

    await expect(run({}, { email: "user@example.com", shopId })).rejects.toThrow("SMTP down");
    expect(authRepo.consumeEmailOtpChallenge).toHaveBeenCalledWith({}, "eotp-fail-1");
  });

  it("verifies email OTP and provisions user/customer session", async () => {
    const codeHash = await hashOtpCode("123456");
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isEmailUsedByActiveShopStaff: vi.fn().mockResolvedValue(false),
      findLatestEmailOtpChallenge: vi.fn().mockResolvedValue({
        id: "eotp-1",
        email: "user@example.com",
        shop_id: shopId,
        code_hash: codeHash,
        attempts: 0,
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }),
      incrementEmailOtpChallengeAttempts: vi.fn(),
      consumeEmailOtpChallenge: vi.fn().mockResolvedValue(undefined),
      getUserByEmail: vi.fn().mockResolvedValue({
        id: "u-1",
        email: "user@example.com",
        phone: null,
        registration_source: "google",
        is_active: true
      }),
      insertUser: vi.fn(),
      getCustomerByUserId: vi.fn().mockResolvedValue({
        id: "c-1",
        user_id: "u-1",
        display_name: null,
        is_blocked: false,
        is_deleted: false
      }),
      insertCustomer: vi.fn(),
      upsertCustomerShopMembership: vi.fn().mockResolvedValue({
        id: "m-1",
        shop_id: shopId,
        customer_id: "c-1",
        is_active: true,
        is_blocked: false,
        is_deleted: false
      }),
      getUserById: vi.fn().mockResolvedValue({
        id: "u-1",
        email: "user@example.com",
        phone: null,
        registration_source: "google",
        is_active: true
      }),
      listActiveShopsForCustomer: vi.fn().mockResolvedValue([{ id: shopId, name: "Demo", slug: "demo" }]),
      isUserActiveShopStaff: vi.fn().mockResolvedValue(false)
    };

    const run = createVerifyCustomerEmailOtp({ authRepo });
    const out = await run({}, { email: "user@example.com", shopId, code: "123456" });

    expect(out.accessToken).toBeTypeOf("string");
    expect(out.customer).toMatchObject({ id: "c-1" });
    expect(authRepo.consumeEmailOtpChallenge).toHaveBeenCalledWith({}, "eotp-1");
    expect(authRepo.upsertCustomerShopMembership).toHaveBeenCalledWith(
      {},
      { shop_id: shopId, customer_id: "c-1" }
    );
  });

  it("blocks email OTP requests after 3 sends in the request window", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      findLatestEmailOtpChallenge: vi.fn().mockResolvedValue(null),
      countEmailOtpChallengesSince: vi.fn().mockResolvedValue(3),
      insertEmailOtpChallenge: vi.fn().mockResolvedValue({ id: "eotp-2" })
    };
    const otpSender = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    const run = createRequestCustomerEmailOtp({ authRepo, otpSender });

    await expect(run({}, { email: "user@example.com", shopId })).rejects.toMatchObject({
      name: "ValidationError",
      message: "Too many OTP requests. Try again later."
    });
    expect(authRepo.insertEmailOtpChallenge).not.toHaveBeenCalled();
    expect(otpSender.sendOtp).not.toHaveBeenCalled();
  });
});
