import { describe, it, expect, vi } from "vitest";
import { createRequestPhoneChangeOtp } from "../../src/application/services/profile/requestPhoneChangeOtp.js";
import { createVerifyPhoneChangeOtp } from "../../src/application/services/profile/verifyPhoneChangeOtp.js";

const shopId = "c0000001-0000-4000-8000-000000000001";
const userId = "u-staff-1";
const customerId = "c-staff-1";

function activeShop() {
  return {
    id: shopId,
    name: "Demo Shop",
    slug: "demo",
    status: "active",
    is_active: true,
    is_blocked: false,
    is_deleted: false
  };
}

function profile(overrides = {}) {
  return {
    user_id: userId,
    phone: "8888888888",
    ...overrides
  };
}

describe("phone change OTP", () => {
  it("allows staff customer to request OTP for their own staff phone", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profile()),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByAnotherActiveShopStaff: vi.fn().mockResolvedValue(false),
      isPhoneUsedByAnotherActiveCustomer: vi.fn().mockResolvedValue(false),
      findLatestOtpChallenge: vi.fn().mockResolvedValue(null),
      countOtpChallengesSince: vi.fn().mockResolvedValue(0),
      insertOtpChallenge: vi.fn().mockResolvedValue({ id: "otp-1" })
    };
    const smsSender = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    const run = createRequestPhoneChangeOtp({ authRepo, smsSender });

    const out = await run(
      {},
      { userId, customerId, shopId, newPhone: "+919999999999" }
    );

    expect(out).toMatchObject({ ok: true });
    expect(authRepo.isPhoneUsedByAnotherActiveShopStaff).toHaveBeenCalledWith(
      {},
      "9999999999",
      userId
    );
  });

  it("rejects phone change when new phone belongs to another active shop staff", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profile()),
      getShopById: vi.fn().mockResolvedValue(activeShop()),
      isPhoneUsedByAnotherActiveShopStaff: vi.fn().mockResolvedValue(true),
      isPhoneUsedByAnotherActiveCustomer: vi.fn().mockResolvedValue(false)
    };
    const run = createRequestPhoneChangeOtp({
      authRepo,
      smsSender: { sendOtp: vi.fn() }
    });

    await expect(
      run({}, { userId, customerId, shopId, newPhone: "+919999999999" })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Phone number is already in use"
    });
  });

  it("rejects verify when new phone belongs to another active shop staff", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profile()),
      isPhoneUsedByAnotherActiveShopStaff: vi.fn().mockResolvedValue(true),
      isPhoneUsedByAnotherActiveCustomer: vi.fn().mockResolvedValue(false)
    };
    const run = createVerifyPhoneChangeOtp({
      authRepo,
      buildStorefrontSession: vi.fn()
    });

    await expect(
      run({}, { userId, customerId, shopId, newPhone: "+919999999999", code: "123456" })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Phone number is already in use"
    });
  });
});
