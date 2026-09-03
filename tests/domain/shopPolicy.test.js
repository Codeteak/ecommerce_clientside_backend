import { describe, it, expect } from "vitest";
import { shopAllowsCustomers } from "../../src/application/services/auth/shopPolicy.js";

describe("shopAllowsCustomers", () => {
  it("allows shops with status active", () => {
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
