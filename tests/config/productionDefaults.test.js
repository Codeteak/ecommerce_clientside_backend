import { describe, it, expect } from "vitest";
import {
  applyProductionEnvDefaults,
  getProductionDefaults
} from "../../src/config/env/productionDefaults.js";

describe("applyProductionEnvDefaults", () => {
  it("applies defaults only in production", () => {
    const dev = {};
    applyProductionEnvDefaults(dev, "development");
    expect(dev.JWT_ACCESS_EXPIRES_IN).toBeUndefined();

    const prod = {};
    applyProductionEnvDefaults(prod, "production");
    expect(prod).toEqual(getProductionDefaults());
  });

  it("does not override explicit production values", () => {
    const prod = { JWT_ACCESS_EXPIRES_IN: "30m", STOREFRONT_ENFORCE_SERVICEABILITY: "false" };
    applyProductionEnvDefaults(prod, "production");
    expect(prod.JWT_ACCESS_EXPIRES_IN).toBe("30m");
    expect(prod.STOREFRONT_ENFORCE_SERVICEABILITY).toBe("false");
  });
});
