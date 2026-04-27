import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { haversineMeters } from "../../../domain/geo/haversineMeters.js";
import { shopAllowsCustomers } from "../auth/shopPolicy.js";

/**
 * Purpose: Decide if a delivery point is within the configured radius of the shop’s address hub.
 * @param {{ shopServiceAreaRepo: import("../../ports/repositories/ShopServiceAreaRepo.js").ShopServiceAreaRepo, defaultMaxRadiusM: number }} deps
 */
export function createCheckShopServiceArea({ shopServiceAreaRepo, defaultMaxRadiusM }) {
  function toFiniteNumber(value) {
    const normalized =
      typeof value === "string" ? value.trim().replace(",", ".") : value;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  /**
   * @param {{ shopId: string, lat: number, lng: number }} input
   */
  return async function checkShopServiceArea(input) {
    const { shopId, lat, lng } = input;
    const reqLat = toFiniteNumber(lat);
    const reqLng = toFiniteNumber(lng);
    if (reqLat == null || reqLng == null) {
      return {
        inServiceArea: false,
        distanceM: null,
        maxRadiusM: defaultMaxRadiusM,
        code: "ADDRESS_COORDINATES_INVALID",
        message: "Address coordinates are invalid."
      };
    }

    const row = await shopServiceAreaRepo.getShopHubForServiceCheck(shopId);
    if (!row) {
      throw new NotFoundError("Shop not found");
    }

    const shopRow = {
      status: row.status,
      is_active: row.is_active,
      is_blocked: row.is_blocked,
      is_deleted: row.is_deleted
    };

    if (!shopAllowsCustomers(shopRow)) {
      return {
        inServiceArea: false,
        distanceM: null,
        maxRadiusM: defaultMaxRadiusM,
        code: "SHOP_UNAVAILABLE",
        message: "This shop is not available for orders."
      };
    }

    const hubLat = toFiniteNumber(row.hub_lat);
    const hubLng = toFiniteNumber(row.hub_lng);
    if (hubLat == null || hubLng == null) {
      return {
        inServiceArea: false,
        distanceM: null,
        maxRadiusM: defaultMaxRadiusM,
        code: "SHOP_LOCATION_MISSING",
        message: "This shop has no delivery location configured."
      };
    }

    const shopRadiusM = toFiniteNumber(row.service_area_radius_meters);
    const maxRadiusM =
      shopRadiusM != null && shopRadiusM > 0 ? Math.round(shopRadiusM) : defaultMaxRadiusM;

    const distanceM = haversineMeters(reqLat, reqLng, hubLat, hubLng);
    const roundedM = Math.round(distanceM);
    const inServiceArea = distanceM <= maxRadiusM;

    return {
      inServiceArea,
      distanceM: roundedM,
      maxRadiusM,
      code: inServiceArea ? "IN_AREA" : "OUT_OF_AREA",
      message: inServiceArea ? "Within delivery range." : "Outside delivery range."
    };
  };
}
