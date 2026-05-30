import { describe, it, expect, vi } from "vitest";
import { resolveUserByPhoneForCustomerLogin } from "../../src/application/services/auth/resolveUserForCustomerLogin.js";

describe("resolveUserByPhoneForCustomerLogin", () => {
  it("falls back to active shop staff user when direct phone lookup misses", async () => {
    const staffUser = {
      id: "staff-u-1",
      email: null,
      phone: "9876545374",
      is_active: true
    };
    const authRepo = {
      getUserByPhone: vi.fn().mockResolvedValue(null),
      getActiveShopStaffUserByPhone: vi.fn().mockResolvedValue(staffUser),
      insertUser: vi.fn()
    };

    const user = await resolveUserByPhoneForCustomerLogin(authRepo, {}, "9876545374");

    expect(user).toEqual(staffUser);
    expect(authRepo.insertUser).not.toHaveBeenCalled();
  });

  it("re-fetches staff user after users_phone_key conflict on insert", async () => {
    const staffUser = {
      id: "staff-u-1",
      email: null,
      phone: "9876545374",
      is_active: true
    };
    const authRepo = {
      getUserByPhone: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      getActiveShopStaffUserByPhone: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(staffUser),
      insertUser: vi.fn().mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }))
    };

    const user = await resolveUserByPhoneForCustomerLogin(authRepo, {}, "9876545374");

    expect(user).toEqual(staffUser);
  });
});
