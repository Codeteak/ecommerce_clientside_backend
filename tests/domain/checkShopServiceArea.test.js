import { describe, it, expect, vi } from "vitest";
import { createCheckShopServiceArea } from "../../src/application/services/shops/checkShopServiceArea.js";

function buildRepo(overrides = {}) {
  return {
    getShopHubForServiceCheck: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      is_active: true,
      is_blocked: false,
      is_deleted: false,
      service_area_radius_meters: 1000,
      hub_lat: 12.9716,
      hub_lng: 77.5946,
      ...overrides
    })
  };
}

describe("checkShopServiceArea", () => {
  it("uses shop-specific radius when available", async () => {
    const repo = buildRepo({ service_area_radius_meters: 1000 });
    const check = createCheckShopServiceArea({
      shopServiceAreaRepo: repo,
      defaultMaxRadiusM: 5000
    });

    const result = await check({
      shopId: "00000000-0000-4000-8000-000000000001",
      lat: 12.979,
      lng: 77.595
    });

    expect(result.maxRadiusM).toBe(1000);
    expect(result.inServiceArea).toBe(true);
  });

  it("falls back to default radius when shop radius is missing", async () => {
    const repo = buildRepo({ service_area_radius_meters: null });
    const check = createCheckShopServiceArea({
      shopServiceAreaRepo: repo,
      defaultMaxRadiusM: 5000
    });

    const result = await check({
      shopId: "00000000-0000-4000-8000-000000000001",
      lat: 12.98,
      lng: 77.594
    });

    expect(result.maxRadiusM).toBe(5000);
    expect(result.inServiceArea).toBe(true);
  });

  it("returns out-of-area when distance exceeds shop radius", async () => {
    const repo = buildRepo({ service_area_radius_meters: 1000 });
    const check = createCheckShopServiceArea({
      shopServiceAreaRepo: repo,
      defaultMaxRadiusM: 5000
    });

    const result = await check({
      shopId: "00000000-0000-4000-8000-000000000001",
      lat: 13.05,
      lng: 77.59
    });

    expect(result.maxRadiusM).toBe(1000);
    expect(result.inServiceArea).toBe(false);
    expect(result.code).toBe("OUT_OF_AREA");
  });
});
