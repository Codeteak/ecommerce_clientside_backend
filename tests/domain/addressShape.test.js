import { describe, it, expect } from "vitest";
import { encodeAddressRaw, parseAddressRow } from "../../src/adapters/repositories/postgres/addressShape.js";

describe("addressShape", () => {
  it("maps plain raw text to line1", () => {
    const addr = parseAddressRow({ raw: "12 MG Road", lat: 12.9, lng: 77.6 }, "a1");
    expect(addr.line1).toBe("12 MG Road");
    expect(addr.lat).toBe(12.9);
  });

  it("round-trips structured fields through raw JSON", () => {
    const raw = encodeAddressRaw({
      line1: "12 MG Road",
      city: "Bengaluru",
      postal_code: "560001",
      lat: 1,
      lng: 2
    });
    const addr = parseAddressRow({ raw, lat: 1, lng: 2 }, "a1");
    expect(addr.line1).toBe("12 MG Road");
    expect(addr.city).toBe("Bengaluru");
    expect(addr.postalCode).toBe("560001");
  });
});
