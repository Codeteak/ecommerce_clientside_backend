import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { signCustomerAccessToken } from "../../src/infra/auth/jwt.js";
import { getTestApp } from "../helpers/testApp.js";
import { AppError } from "../../src/domain/errors/AppError.js";
import { createCheckoutCartValidation } from "../../src/application/services/checkout/checkoutCartValidation.js";

const SHOP_ID = "00000000-0000-4000-8000-000000000001";

function customerBearer() {
  const { token } = signCustomerAccessToken({
    userId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0000-000000000002"
  });
  return token;
}

describe("Storefront address HTTP validation", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("DELETE returns 401 without auth", async () => {
    const res = await request(app)
      .delete("/storefront/address")
      .set("x-shop-id", SHOP_ID)
      .expect(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("POST rejects removed field with 400", async () => {
    const res = await request(app)
      .post("/storefront/address")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .set("x-shop-id", SHOP_ID)
      .send({ line1: "12 Hill", state: "MH" })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("POST rejects missing line1", async () => {
    const res = await request(app)
      .post("/storefront/address")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .set("x-shop-id", SHOP_ID)
      .send({ city: "Mumbai" })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH rejects postalCode", async () => {
    const res = await request(app)
      .patch("/storefront/address")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .set("x-shop-id", SHOP_ID)
      .send({ postalCode: "400001" })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("ADDRESS_NOT_FOUND error shape", () => {
  it("uses 404 ADDRESS_NOT_FOUND for missing linked address", () => {
    const err = new AppError("No address is linked to this account", {
      statusCode: 404,
      code: "ADDRESS_NOT_FOUND"
    });
    expect(err.code).toBe("ADDRESS_NOT_FOUND");
    expect(err.statusCode).toBe(404);
  });
});

describe("storefront address OpenAPI", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("documents DELETE and omits state/postalCode/country", async () => {
    const res = await request(app).get("/openapi.json").expect(200);
    const addressPath = res.body.paths?.["/storefront/address"];
    expect(addressPath?.delete?.responses?.["204"]).toBeTruthy();
    expect(addressPath?.delete?.responses?.["404"]).toBeTruthy();

    const addr = res.body.components?.schemas?.StorefrontAddress?.properties;
    expect(addr?.state).toBeUndefined();
    expect(addr?.postalCode).toBeUndefined();
    expect(addr?.country).toBeUndefined();
    expect(addr?.line1).toBeTruthy();
    expect(addr?.city).toBeTruthy();

    const post = res.body.components?.schemas?.AddressPostRequest;
    expect(post?.required).toContain("line1");
    expect(post?.properties?.state).toBeUndefined();
    expect(post?.properties?.postalCode).toBeUndefined();
    expect(post?.properties?.country).toBeUndefined();
  });
});

describe("checkout ADDRESS_REQUIRED after delete", () => {
  it("fails when profile has no address", async () => {
    const authRepo = {
      getMembershipByCustomerAndShop: vi.fn().mockResolvedValue({
        is_active: true,
        is_blocked: false,
        is_deleted: false
      }),
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue({
        id: "cust-1",
        user_id: "user-1",
        is_blocked: false,
        is_deleted: false,
        address: null
      })
    };
    const { validateCheckoutCustomer } = createCheckoutCartValidation({
      authRepo,
      checkShopServiceArea: vi.fn()
    });
    await expect(
      validateCheckoutCustomer({}, "shop-1", "cust-1", "user-1", {})
    ).rejects.toMatchObject({ code: "ADDRESS_REQUIRED", statusCode: 400 });
  });
});
