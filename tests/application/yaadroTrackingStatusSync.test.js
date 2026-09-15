import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractYaadroTrackingToken,
  mapYaadroOrderStatusToEcommerce,
  shouldUpgradeEcommerceStatus
} from "../../src/application/services/storefront/yaadroTrackingStatusSync.js";

describe("yaadroTrackingStatusSync", () => {
  it("extracts token from tracking URL", () => {
    assert.equal(
      extractYaadroTrackingToken(
        "https://www.yaadro.shop/track/order/511411/tracking/a172205b-06ca-4d0c-94c3-99499d05b556-1789452131655"
      ),
      "a172205b-06ca-4d0c-94c3-99499d05b556-1789452131655"
    );
  });

  it("maps Delivered / delivered flag", () => {
    assert.equal(
      mapYaadroOrderStatusToEcommerce({ orderStatus: "Delivered" }),
      "delivered"
    );
    assert.equal(
      mapYaadroOrderStatusToEcommerce({ orderStatus: "Pending", delivered: true }),
      "delivered"
    );
  });

  it("maps assigned / out for delivery", () => {
    assert.equal(
      mapYaadroOrderStatusToEcommerce({ orderStatus: "Assigned" }),
      "out_for_delivery"
    );
    assert.equal(
      mapYaadroOrderStatusToEcommerce({ orderStatus: "Out for Delivery" }),
      "out_for_delivery"
    );
  });

  it("ignores pending", () => {
    assert.equal(mapYaadroOrderStatusToEcommerce({ orderStatus: "Pending" }), null);
  });

  it("only upgrades forward", () => {
    assert.equal(shouldUpgradeEcommerceStatus("accepted", "delivered"), true);
    assert.equal(shouldUpgradeEcommerceStatus("accepted", "out_for_delivery"), true);
    assert.equal(shouldUpgradeEcommerceStatus("delivered", "accepted"), false);
    assert.equal(shouldUpgradeEcommerceStatus("accepted", "accepted"), false);
    assert.equal(shouldUpgradeEcommerceStatus("accepted", null), false);
  });
});
