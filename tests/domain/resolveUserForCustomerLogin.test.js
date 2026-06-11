import { describe, it, expect, vi } from "vitest";
import {
  resolveUserByPhoneForCustomerLogin,
  syncUserPhoneForCustomerLogin
} from "../../src/application/services/auth/resolveUserForCustomerLogin.js";

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

describe("syncUserPhoneForCustomerLogin", () => {
  it("skips update when stored phone is equivalent but differently formatted", async () => {
    const staffUser = { id: "staff-u-1", phone: "+919562170975", is_active: true };
    const authRepo = {
      getUserByPhone: vi.fn(),
      updateUserPhone: vi.fn()
    };

    const user = await syncUserPhoneForCustomerLogin(authRepo, {}, staffUser, "9562170975");

    expect(user).toEqual({ ...staffUser, phone: "9562170975" });
    expect(authRepo.updateUserPhone).not.toHaveBeenCalled();
  });

  it("uses existing user when canonical phone is already owned elsewhere", async () => {
    const staffUser = { id: "staff-u-1", phone: null, is_active: true };
    const canonicalUser = { id: "user-2", phone: "9562170975", is_active: true };
    const authRepo = {
      getUserByPhone: vi.fn().mockResolvedValue(canonicalUser),
      updateUserPhone: vi.fn()
    };

    const user = await syncUserPhoneForCustomerLogin(authRepo, {}, staffUser, "9562170975");

    expect(user).toEqual(canonicalUser);
    expect(authRepo.updateUserPhone).not.toHaveBeenCalled();
  });

  it("falls back to phone owner after update conflict", async () => {
    const staffUser = { id: "staff-u-1", phone: "9123456789", is_active: true };
    const canonicalUser = { id: "user-2", phone: "9562170975", is_active: true };
    const authRepo = {
      getUserByPhone: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(canonicalUser),
      updateUserPhone: vi.fn().mockRejectedValue(
        Object.assign(new Error("duplicate"), { code: "23505", constraint: "users_phone_key" })
      )
    };

    const user = await syncUserPhoneForCustomerLogin(authRepo, {}, staffUser, "9562170975");

    expect(user).toEqual(canonicalUser);
    expect(authRepo.updateUserPhone).toHaveBeenCalledWith({}, "staff-u-1", "9562170975");
  });
});
