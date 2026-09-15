import { describe, it, expect } from "vitest";
import {
  extractYaadroTrackingToken,
  mapYaadroOrderStatusToEcommerce,
  shouldUpgradeEcommerceStatus
} from "../../src/application/services/storefront/yaadroTrackingStatusSync.js";

describe("yaadroTrackingStatusSync", () => {
  it("extracts token from tracking URL", () => {
    expect(
      extractYaadroTrackingToken(
        "https://www.yaadro.shop/track/order/511411/tracking/a172205b-06ca-4d0c-94c3-99499d05b556-1789452131655"
      )
    ).toBe("a172205b-06ca-4d0c-94c3-99499d05b556-1789452131655");
  });

  it("maps Delivered / delivered flag", () => {
    expect(mapYaadroOrderStatusToEcommerce({ orderStatus: "Delivered" })).toBe("delivered");
    expect(
      mapYaadroOrderStatusToEcommerce({ orderStatus: "Pending", delivered: true })
    ).toBe("delivered");
  });

  it("maps assigned / out for delivery", () => {
    expect(mapYaadroOrderStatusToEcommerce({ orderStatus: "Assigned" })).toBe(
      "out_for_delivery"
    );
    expect(mapYaadroOrderStatusToEcommerce({ orderStatus: "Out for Delivery" })).toBe(
      "out_for_delivery"
    );
  });

  it("ignores pending", () => {
    expect(mapYaadroOrderStatusToEcommerce({ orderStatus: "Pending" })).toBeNull();
  });

  it("only upgrades forward", () => {
    expect(shouldUpgradeEcommerceStatus("accepted", "delivered")).toBe(true);
    expect(shouldUpgradeEcommerceStatus("accepted", "out_for_delivery")).toBe(true);
    expect(shouldUpgradeEcommerceStatus("delivered", "accepted")).toBe(false);
    expect(shouldUpgradeEcommerceStatus("accepted", "accepted")).toBe(false);
    expect(shouldUpgradeEcommerceStatus("accepted", null)).toBe(false);
  });
});
