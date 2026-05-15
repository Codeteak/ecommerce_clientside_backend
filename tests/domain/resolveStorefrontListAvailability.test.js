import { describe, expect, it } from "vitest";
import { resolveStorefrontListAvailability } from "../../src/application/services/catalog/resolveStorefrontListAvailability.js";

describe("resolveStorefrontListAvailability", () => {
  it("defaults to in_stock when availability omitted", () => {
    expect(resolveStorefrontListAvailability(undefined, false)).toBe("in_stock");
    expect(resolveStorefrontListAvailability(null, false)).toBe("in_stock");
  });

  it("honours explicit availability filter", () => {
    expect(resolveStorefrontListAvailability("out_of_stock", false)).toBe("out_of_stock");
  });

  it("allows no availability filter when include_all_availability is true", () => {
    expect(resolveStorefrontListAvailability(undefined, true)).toBe(null);
    expect(resolveStorefrontListAvailability("unknown", true)).toBe("unknown");
  });
});
