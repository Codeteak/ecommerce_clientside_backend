import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { getRequestLogger } from "../../../infra/logging/requestContext.js";
import { checkoutError } from "./checkoutInput.js";

export function createCheckoutCartValidation({ authRepo, checkShopServiceArea }) {
  async function assertAddressServiceable(shopId, profileAddress, requestMeta, userId, customerId) {
    const service = await checkShopServiceArea({
      shopId,
      lat: Number(profileAddress.lat),
      lng: Number(profileAddress.lng)
    });
    if (service.inServiceArea) return;

    getRequestLogger().warn(
      {
        event: "api.checkout.failed",
        requestId: requestMeta?.requestId,
        method: requestMeta?.method,
        route: requestMeta?.route,
        shopId,
        userId,
        customerId,
        code: service.code || "ADDRESS_NOT_SERVICEABLE",
        distanceM: service.distanceM ?? null,
        maxRadiusM: service.maxRadiusM ?? null,
        addressLat: Number(profileAddress.lat),
        addressLng: Number(profileAddress.lng)
      },
      "Checkout serviceability rejected"
    );
    if (service.code === "SHOP_UNAVAILABLE") {
      throw checkoutError("SHOP_UNAVAILABLE", service.message || "This shop is not available for orders.");
    }
    if (service.code === "SHOP_LOCATION_MISSING") {
      throw checkoutError("SHOP_LOCATION_MISSING", service.message || "Shop delivery location is not configured.");
    }
    if (service.code === "ADDRESS_COORDINATES_INVALID") {
      throw checkoutError(
        "ADDRESS_COORDINATES_INVALID",
        service.message || "Selected address coordinates are invalid."
      );
    }
    const distanceInfo =
      service.distanceM != null && service.maxRadiusM != null
        ? ` (distance ${service.distanceM}m, max ${service.maxRadiusM}m)`
        : "";
    throw checkoutError(
      "ADDRESS_NOT_SERVICEABLE",
      `${service.message || "Selected address is not serviceable for delivery"}${distanceInfo}`
    );
  }

  async function validateCheckoutCustomer(client, shopId, customerId, userId, requestMeta) {
    const membership = await authRepo.getMembershipByCustomerAndShop(client, customerId, shopId);
    if (!membership?.is_active || membership.is_blocked || membership.is_deleted) {
      throw new ValidationError("No access to this shop");
    }

    const profile = await authRepo.getCustomerProfileByCustomerId(client, customerId);
    if (!profile || profile.is_blocked || profile.is_deleted) {
      throw new ValidationError("Invalid customer");
    }
    if (profile.user_id !== userId) {
      throw new ValidationError("Invalid customer");
    }
    if (!profile.address || !profile.address.id || !profile.address.line1) {
      throw checkoutError("ADDRESS_REQUIRED", "Delivery address is required");
    }
    if (profile.address.lat == null || profile.address.lng == null) {
      throw checkoutError("ADDRESS_COORDINATES_REQUIRED", "Selected address must include location coordinates");
    }
    await assertAddressServiceable(shopId, profile.address, requestMeta, userId, customerId);
    return profile;
  }

  return { assertAddressServiceable, validateCheckoutCustomer };
}
