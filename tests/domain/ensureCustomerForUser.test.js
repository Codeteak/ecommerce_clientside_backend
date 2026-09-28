import { describe, it, expect, vi } from "vitest";
import { ensureCustomerForUser } from "../../src/application/services/auth/resolveUserForCustomerLogin.js";

describe("ensureCustomerForUser", () => {
  it("copies display_name from another shop when creating a new customer", async () => {
    const insertCustomer = vi.fn().mockResolvedValue({ id: "c-new" });
    const authRepo = {
      getCustomerByUserId: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "c-new",
          user_id: "u-1",
          display_name: "Ravi",
          is_blocked: false,
          is_deleted: false
        }),
      findDisplayNameForUser: vi.fn().mockResolvedValue("Ravi"),
      insertCustomer
    };

    const out = await ensureCustomerForUser(authRepo, {}, "u-1", null, "shop-b");

    expect(authRepo.findDisplayNameForUser).toHaveBeenCalledWith({}, "u-1");
    expect(insertCustomer).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        user_id: "u-1",
        shop_id: "shop-b",
        display_name: "Ravi"
      })
    );
    expect(out.display_name).toBe("Ravi");
  });

  it("keeps an explicit displayName over sibling shop name", async () => {
    const insertCustomer = vi.fn().mockResolvedValue({ id: "c-new" });
    const authRepo = {
      getCustomerByUserId: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "c-new",
          user_id: "u-1",
          display_name: "Explicit",
          is_blocked: false,
          is_deleted: false
        }),
      findDisplayNameForUser: vi.fn().mockResolvedValue("Sibling"),
      insertCustomer
    };

    await ensureCustomerForUser(authRepo, {}, "u-1", "Explicit", "shop-b");

    expect(authRepo.findDisplayNameForUser).not.toHaveBeenCalled();
    expect(insertCustomer).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ display_name: "Explicit" })
    );
  });
});
