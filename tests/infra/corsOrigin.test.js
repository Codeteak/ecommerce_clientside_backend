import { describe, it, expect } from "vitest";
import { createCorsOriginDelegate } from "../../src/infra/http/corsOrigin.js";

function allow(delegate, origin) {
  return new Promise((resolve, reject) => {
    delegate(origin, (err, ok) => {
      if (err) reject(err);
      else resolve(ok);
    });
  });
}

describe("createCorsOriginDelegate", () => {
  it("allows explicit list origins", async () => {
    const d = createCorsOriginDelegate(
      ["https://yaadro.shop", "https://marketfresh.in"],
      "yaadro.online"
    );
    expect(await allow(d, "https://yaadro.shop")).toBe(true);
    expect(await allow(d, "https://evil.example")).toBe(false);
  });

  it("allows storefront root-domain subdomains", async () => {
    const d = createCorsOriginDelegate("https://yaadro.shop", "yaadro.online");
    expect(await allow(d, "https://greens.yaadro.online")).toBe(true);
    expect(await allow(d, "https://www.greens.yaadro.online")).toBe(true);
    expect(await allow(d, "https://yaadro.online")).toBe(true);
    expect(await allow(d, "https://notyaadro.online")).toBe(false);
  });

  it("allows missing origin", async () => {
    const d = createCorsOriginDelegate("https://yaadro.shop", "yaadro.online");
    expect(await allow(d, undefined)).toBe(true);
  });
});
