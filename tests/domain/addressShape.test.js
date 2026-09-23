import { describe, it, expect } from "vitest";
import { encodeAddressRaw, parseAddressRow } from "../../src/adapters/repositories/postgres/addressShape.js";
import { customerAddressSnapshot } from "../../src/application/services/checkout/checkoutInput.js";
import {
  storefrontAddressPostSchema,
  storefrontAddressPatchSchema
} from "../../src/interface/http/validations/storefrontRestSchemas.js";

describe("addressShape", () => {
  it("maps plain raw text to line1", () => {
    const addr = parseAddressRow({ raw: "12 MG Road", lat: 12.9, lng: 77.6 }, "a1");
    expect(addr.line1).toBe("12 MG Road");
    expect(addr.lat).toBe(12.9);
    expect(addr).not.toHaveProperty("state");
    expect(addr).not.toHaveProperty("postalCode");
    expect(addr).not.toHaveProperty("country");
  });

  it("round-trips structured fields through raw JSON without removed keys", () => {
    const raw = encodeAddressRaw({
      line1: "12 MG Road",
      line2: "Apt 2",
      landmark: "Near park",
      city: "Bengaluru",
      postal_code: "560001",
      state: "KA",
      country: "IN",
      lat: 1,
      lng: 2
    });
    expect(JSON.parse(raw)).toEqual({
      line1: "12 MG Road",
      line2: "Apt 2",
      landmark: "Near park",
      city: "Bengaluru"
    });
    const addr = parseAddressRow({ raw, lat: 1, lng: 2 }, "a1");
    expect(addr.line1).toBe("12 MG Road");
    expect(addr.city).toBe("Bengaluru");
    expect(addr).not.toHaveProperty("postalCode");
    expect(addr).not.toHaveProperty("state");
    expect(addr).not.toHaveProperty("country");
  });

  it("ignores legacy state/postal_code/country in old raw JSON", () => {
    const raw = JSON.stringify({
      line1: "Old house",
      city: "Pune",
      state: "MH",
      postal_code: "411001",
      country: "India"
    });
    const addr = parseAddressRow({ raw, lat: null, lng: null }, "legacy-1");
    expect(addr).toMatchObject({
      id: "legacy-1",
      line1: "Old house",
      city: "Pune",
      landmark: null,
      line2: null
    });
    expect(addr).not.toHaveProperty("state");
    expect(addr).not.toHaveProperty("postalCode");
    expect(addr).not.toHaveProperty("country");
  });
});

describe("customerAddressSnapshot", () => {
  it("joins kept fields only", () => {
    expect(
      customerAddressSnapshot({
        line1: "12 Hill",
        line2: "Apt 4",
        landmark: "Station",
        city: "Mumbai",
        state: "MH",
        postalCode: "400050",
        country: "IN"
      })
    ).toBe("12 Hill, Apt 4, Station, Mumbai");
  });

  it("falls back to raw when structured fields empty", () => {
    expect(customerAddressSnapshot({ raw: "freeform note" })).toBe("freeform note");
  });
});

describe("storefront address schemas", () => {
  it("accepts POST with line1, city, and coords", () => {
    const parsed = storefrontAddressPostSchema.parse({
      line1: "12 Hill Road",
      city: "Mumbai",
      lat: 19.07,
      lng: 72.87
    });
    expect(parsed.line1).toBe("12 Hill Road");
    expect(parsed.city).toBe("Mumbai");
  });

  it("rejects POST missing line1", () => {
    expect(() => storefrontAddressPostSchema.parse({ city: "Mumbai" })).toThrow();
  });

  it("rejects removed fields on POST", () => {
    expect(() =>
      storefrontAddressPostSchema.parse({
        line1: "12 Hill",
        state: "MH"
      })
    ).toThrow();
    expect(() =>
      storefrontAddressPostSchema.parse({
        line1: "12 Hill",
        postalCode: "400001"
      })
    ).toThrow();
    expect(() =>
      storefrontAddressPostSchema.parse({
        line1: "12 Hill",
        zipCode: "400001"
      })
    ).toThrow();
    expect(() =>
      storefrontAddressPostSchema.parse({
        line1: "12 Hill",
        country: "India"
      })
    ).toThrow();
  });

  it("accepts PATCH landmark only", () => {
    const parsed = storefrontAddressPatchSchema.parse({ landmark: "Near metro" });
    expect(parsed).toEqual({ landmark: "Near metro" });
  });

  it("allows clearing line2 with null on PATCH", () => {
    const parsed = storefrontAddressPatchSchema.parse({ line2: null });
    expect(parsed.line2).toBeNull();
  });

  it("rejects removed fields on PATCH", () => {
    expect(() => storefrontAddressPatchSchema.parse({ state: "MH" })).toThrow();
    expect(() => storefrontAddressPatchSchema.parse({ postal_code: "400001" })).toThrow();
  });
});
