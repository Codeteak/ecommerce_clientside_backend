import { describe, it, expect } from "vitest";
import {
  shopAllowsCustomers,
  shopUnavailableMessage,
  shopUnavailableCode,
  assertShopAllowsCustomers
} from "../../src/application/services/auth/shopPolicy.js";
import { AppError } from "../../src/domain/errors/AppError.js";

describe("shopAllowsCustomers", () => {
  it("allows active shops", () => {
    expect(shopAllowsCustomers({ status: "active" })).toBe(true);
    expect(shopAllowsCustomers({ status: "ACTIVE" })).toBe(true);
  });

  it("rejects blocked or deleted shops", () => {
    expect(shopAllowsCustomers({ status: "blocked" })).toBe(false);
    expect(shopAllowsCustomers({ status: "deleted" })).toBe(false);
  });

  it("rejects missing shop or status", () => {
    expect(shopAllowsCustomers(null)).toBe(false);
    expect(shopAllowsCustomers({})).toBe(false);
    expect(shopAllowsCustomers({ status: "" })).toBe(false);
  });
});

describe("shop unavailable messaging", () => {
  it("says shop is blocked when status is blocked", () => {
    expect(shopUnavailableMessage({ status: "blocked" })).toBe("Shop is blocked");
    expect(shopUnavailableCode({ status: "blocked" })).toBe("SHOP_BLOCKED");
  });

  it("uses generic unavailable for deleted or unknown", () => {
    expect(shopUnavailableMessage({ status: "deleted" })).toBe("Shop is not available");
    expect(shopUnavailableCode({ status: "deleted" })).toBe("SHOP_DELETED");
    expect(shopUnavailableMessage({})).toBe("Shop is not available");
    expect(shopUnavailableCode({})).toBe("SHOP_UNAVAILABLE");
  });

  it("assertShopAllowsCustomers throws AppError with blocked message", () => {
    expect(() => assertShopAllowsCustomers({ status: "blocked" })).toThrow(AppError);
    try {
      assertShopAllowsCustomers({ status: "blocked" }, { statusCode: 400 });
    } catch (err) {
      expect(err).toMatchObject({
        message: "Shop is blocked",
        code: "SHOP_BLOCKED",
        statusCode: 400
      });
    }
  });
});
