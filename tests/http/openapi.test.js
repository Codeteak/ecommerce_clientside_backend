import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("OpenAPI / Swagger", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("GET /openapi.json returns OpenAPI 3 document", async () => {
    const res = await request(app).get("/openapi.json").expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info?.title).toBeTruthy();
    expect(res.body.paths?.["/health"]).toBeTruthy();
    expect(res.body.paths?.["/storefront/checkout"]?.post).toBeTruthy();
    expect(res.body.paths?.["/storefront/products/id/{id}"]?.get).toBeTruthy();
    expect(res.body.paths?.["/api/auth/otp/request"]?.post).toBeTruthy();
    expect(res.body.paths?.["/api/auth/otp/verify"]?.post).toBeTruthy();
    expect(res.body.paths?.["/api/catalog/search"]?.get).toBeTruthy();
  });

  it("documents storefront orders with line item image schema", async () => {
    const res = await request(app).get("/openapi.json").expect(200);
    const lineItem = res.body.components?.schemas?.StorefrontOrderLineItem;
    expect(lineItem?.properties?.image).toBeTruthy();
    expect(lineItem?.properties?.image?.nullable).toBe(true);
    expect(lineItem?.required).toContain("image");

    const list200 = res.body.paths?.["/storefront/orders"]?.get?.responses?.["200"];
    expect(list200?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/StorefrontOrdersListResponse"
    );

    const detail200 = res.body.paths?.["/storefront/orders/{id}"]?.get?.responses?.["200"];
    expect(detail200?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/StorefrontOrderDetailResponse"
    );
  });

  it("GET /api-docs serves Swagger UI HTML", async () => {
    const res = await request(app).get("/api-docs/").expect(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("swagger-ui");
  });
});
