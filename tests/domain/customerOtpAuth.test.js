import { describe, it, expect, vi } from "vitest";
import { createRequestCustomerOtp } from "../../src/application/services/auth/requestCustomerOtp.js";
import { createVerifyCustomerOtp } from "../../src/application/services/auth/verifyCustomerOtp.js";
import { hashOtpCode } from "../../src/infra/security/otpHasher.js";

const shopId = "c0000001-0000-4000-8000-000000000001";
/** Matches `shops` row shape from `getShopById`; `name` is passed to SMS as `shopName` (MSG91 VAR2). */
const mockShopDisplayName = "Fixture Shop";

function activeShop() {
  return {
    id: shopId,
    name: mockShopDisplayName,
    status: "active",
    is_active: true,
    is_blocked: false,
    is_deleted: false
  };
}

describe("customer OTP auth", () => {
  it("requests OTP and sends via sms sender", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      findLatestOtpChallenge: vi.fn().mockResolvedValue(null),
      countOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertOtpChallenge: vi.fn().mockResolvedValue({ id: "otp-1" })
    };
    const smsSender = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    const run = createRequestCustomerOtp({ authRepo, smsSender });

    const out = await run({}, { phone: "+91 99999-99999", shopId });

    expect(out).toMatchObject({ ok: true });
    expect(authRepo.insertOtpChallenge).toHaveBeenCalledTimes(1);
    const smsArg = smsSender.sendOtp.mock.calls[0][0];
    expect(smsArg.to).toBe("+919999999999");
    expect(String(smsArg.code)).toMatch(/^\d{6}$/);
    expect(smsArg.shopName).toBe(mockShopDisplayName);
  });

  it("consumes OTP challenge when SMS send fails", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      findLatestOtpChallenge: vi.fn().mockResolvedValue(null),
      countOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertOtpChallenge: vi.fn().mockResolvedValue({ id: "otp-fail-1" }),
      consumeOtpChallenge: vi.fn().mockResolvedValue(undefined)
    };
    const smsSender = {
      sendOtp: vi.fn().mockRejectedValue(new Error("SMS down"))
    };
    const run = createRequestCustomerOtp({ authRepo, smsSender });

    await expect(run({}, { phone: "+919999999999", shopId })).rejects.toThrow("SMS down");
    expect(authRepo.consumeOtpChallenge).toHaveBeenCalledWith({}, "otp-fail-1");
  });

  it("rejects OTP request during resend cooldown", async () => {
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByActiveShopStaff: vi.fn().mockResolvedValue(false),
      findLatestOtpChallenge: vi.fn().mockResolvedValue({
        id: "otp-1",
        consumed_at: null,
        created_at: new Date().toISOString()
      }),
      countOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertOtpChallenge: vi.fn()
    };
    const run = createRequestCustomerOtp({ authRepo, smsSender: { sendOtp: vi.fn() } });

    await expect(run({}, { phone: "+919999999999", shopId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("fails verify with invalid OTP and increments attempts", async () => {
    const codeHash = await hashOtpCode("123456");
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByActiveShopStaff: vi.fn().mockResolvedValue(false),
      findLatestOtpChallenge: vi.fn().mockResolvedValue({
        id: "otp-1",
        phone: "+919999999999",
        shop_id: shopId,
        code_hash: codeHash,
        attempts: 0,
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }),
      incrementOtpChallengeAttempts: vi.fn().mockResolvedValue({ id: "otp-1", attempts: 1 }),
      consumeOtpChallenge: vi.fn()
    };
    const run = createVerifyCustomerOtp({ authRepo });

    await expect(
      run({}, { phone: "+919999999999", shopId, code: "000000" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(authRepo.incrementOtpChallengeAttempts).toHaveBeenCalledWith({}, "otp-1");
  });

  it("verifies OTP and returns storefront session payload", async () => {
    const codeHash = await hashOtpCode("123456");
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByActiveShopStaff: vi.fn().mockResolvedValue(false),
      findLatestOtpChallenge: vi.fn().mockResolvedValue({
        id: "otp-1",
        phone: "+919999999999",
        shop_id: shopId,
        code_hash: codeHash,
        attempts: 0,
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }),
      incrementOtpChallengeAttempts: vi.fn(),
      consumeOtpChallenge: vi.fn().mockResolvedValue(undefined),
      getUserByPhone: vi.fn().mockResolvedValue({
        id: "u-1",
        email: null,
        phone: "+919999999999",
        registration_source: "phone_otp",
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
      getMembershipByCustomerAndShop: vi.fn().mockResolvedValue({
        id: "m-1",
        is_active: true,
        is_blocked: false,
        is_deleted: false
      }),
      insertMembership: vi.fn(),
      reactivateMembership: vi.fn(),
      getUserById: vi.fn().mockResolvedValue({
        id: "u-1",
        email: null,
        phone: "+919999999999",
        registration_source: "phone_otp",
        is_active: true
      }),
      listActiveShopsForCustomer: vi.fn().mockResolvedValue([{ id: shopId, name: "Demo", slug: "demo" }]),
      isUserActiveShopStaff: vi.fn().mockResolvedValue(false)
    };

    const run = createVerifyCustomerOtp({ authRepo });
    const out = await run({}, { phone: "+919999999999", shopId, code: "123456" });

    expect(out.accessToken).toBeTypeOf("string");
    expect(out.customer).toMatchObject({ id: "c-1" });
    expect(authRepo.consumeOtpChallenge).toHaveBeenCalledWith({}, "otp-1");
  });

  it("rejects verify when phone belongs to active shop staff", async () => {
    const codeHash = await hashOtpCode("123456");
    const authRepo = {
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByActiveShopStaff: vi.fn().mockResolvedValue(true),
      findLatestOtpChallenge: vi.fn().mockResolvedValue({
        id: "otp-1",
        phone: "+919999999999",
        shop_id: shopId,
        code_hash: codeHash,
        attempts: 0,
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }),
      consumeOtpChallenge: vi.fn()
    };
    const run = createVerifyCustomerOtp({ authRepo });
    await expect(run({}, { phone: "+919999999999", shopId, code: "123456" })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
