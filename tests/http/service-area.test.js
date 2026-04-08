import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("POST /storefront/location/check", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app)
      .post("/storefront/location/check")
      .send({ lat: 0, lng: 0 })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when latitude is out of range", async () => {
    const res = await request(app)
      .post("/storefront/location/check?shopId=00000000-0000-4000-8000-000000000000")
      .send({ lat: 91, lng: 0 })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
