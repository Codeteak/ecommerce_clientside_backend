import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(await allow(d, "https://yaadro.shop"), true);
    assert.equal(await allow(d, "https://evil.example"), false);
  });

  it("allows storefront root-domain subdomains", async () => {
    const d = createCorsOriginDelegate("https://yaadro.shop", "yaadro.online");
    assert.equal(await allow(d, "https://greens.yaadro.online"), true);
    assert.equal(await allow(d, "https://www.greens.yaadro.online"), true);
    assert.equal(await allow(d, "https://yaadro.online"), true);
    assert.equal(await allow(d, "https://notyaadro.online"), false);
  });

  it("allows missing origin", async () => {
    const d = createCorsOriginDelegate("https://yaadro.shop", "yaadro.online");
    assert.equal(await allow(d, undefined), true);
  });
});
