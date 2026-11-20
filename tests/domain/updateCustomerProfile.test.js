import { describe, expect, it, vi } from "vitest";
import { updateCustomerProfile } from "../../src/application/services/profile/updateCustomerProfile.js";
import { AuthError } from "../../src/domain/errors/AuthError.js";

function profileRow(overrides = {}) {
  return {
    id: "c1",
    user_id: "u1",
    display_name: "Ada",
    phone: "9876543210",
    is_blocked: false,
    is_deleted: false,
    address: null,
    ...overrides
  };
}

describe("updateCustomerProfile", () => {
  it("checks the locked row instead of pre-reading when the name changes", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profileRow({ display_name: "New" })),
      patchCustomerProfile: vi.fn().mockResolvedValue(undefined),
      updateUserPhone: vi.fn()
    };
    const run = updateCustomerProfile({ authRepo });

    const out = await run({}, { customerId: "c1", userId: "u1", patch: { displayName: "New" } });

    expect(authRepo.patchCustomerProfile).toHaveBeenCalledWith(
      {},
      {
        customerId: "c1",
        userId: "u1",
        displayName: "New",
        addressPatch: undefined,
        rejectInactive: true
      }
    );
    expect(authRepo.getCustomerProfileByCustomerId).toHaveBeenCalledTimes(1);
    expect(out.user.name).toBe("New");
  });

  it("still reads the profile before a phone-only change", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profileRow()),
      patchCustomerProfile: vi.fn(),
      updateUserPhone: vi.fn().mockResolvedValue(undefined)
    };
    const run = updateCustomerProfile({ authRepo });

    await run({}, { customerId: "c1", userId: "u1", patch: { phone: "9876543210" } });

    expect(authRepo.patchCustomerProfile).not.toHaveBeenCalled();
    expect(authRepo.getCustomerProfileByCustomerId).toHaveBeenCalledTimes(2);
    expect(authRepo.updateUserPhone).toHaveBeenCalledWith({}, "u1", "9876543210");
  });

  it("does not change the phone when the locked customer is blocked", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn(),
      patchCustomerProfile: vi.fn().mockRejectedValue(new AuthError("Invalid credentials")),
      updateUserPhone: vi.fn()
    };
    const run = updateCustomerProfile({ authRepo });

    await expect(
      run({}, { customerId: "c1", userId: "u1", patch: { name: "X", phone: "9876543210" } })
    ).rejects.toBeInstanceOf(AuthError);
    expect(authRepo.updateUserPhone).not.toHaveBeenCalled();
    expect(authRepo.getCustomerProfileByCustomerId).not.toHaveBeenCalled();
  });

  it("refuses a phone-only change for a blocked customer before writing", async () => {
    const authRepo = {
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue(profileRow({ is_blocked: true })),
      patchCustomerProfile: vi.fn(),
      updateUserPhone: vi.fn()
    };
    const run = updateCustomerProfile({ authRepo });

    await expect(
      run({}, { customerId: "c1", userId: "u1", patch: { phone: "9876543210" } })
    ).rejects.toBeInstanceOf(AuthError);
    expect(authRepo.updateUserPhone).not.toHaveBeenCalled();
    expect(authRepo.getCustomerProfileByCustomerId).toHaveBeenCalledTimes(1);
  });
});
