import { AuthError } from "../../../domain/errors/AuthError.js";
import { ConflictError } from "../../../domain/errors/ConflictError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { getCustomerProfile } from "./getCustomerProfile.js";
import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";

/**
 * Purpose: Partially update display name, phone, and/or nested address fields; returns the same shape as GET.
 * @param {{ authRepo: import("../../ports/repositories/auth/CustomerProfileRepo.js").CustomerProfileRepo }} deps
 */
export function updateCustomerProfile({ authRepo }) {
  const getProfile = getCustomerProfile({ authRepo });

  return async function execute(client, { customerId, userId, patch }) {
    const addressPatch =
      patch.address !== undefined && patch.address != null && Object.keys(patch.address).length > 0
        ? patch.address
        : undefined;

    const displayName = patch.displayName !== undefined ? patch.displayName : patch.name;
    const hasDisplay = displayName !== undefined;
    const hasAddress = addressPatch !== undefined;
    const hasPhone = patch.phone !== undefined;

    if (hasDisplay || hasAddress) {
      // The locked customer row is the existence and blocked check. The profile
      // is read once after the write so the response matches what was saved.
      await authRepo.patchCustomerProfile(client, {
        customerId,
        userId,
        displayName,
        addressPatch,
        rejectInactive: true
      });
    } else {
      const existing = await authRepo.getCustomerProfileByCustomerId(client, customerId);
      if (!existing || existing.user_id !== userId) {
        throw new NotFoundError("Profile not found");
      }
      if (existing.is_blocked || existing.is_deleted) {
        throw new AuthError("Invalid credentials");
      }
    }
    if (hasPhone) {
      const storedPhone =
        patch.phone == null ? null : normalizeCustomerPhoneForStorage(patch.phone);
      try {
        await authRepo.updateUserPhone(client, userId, storedPhone);
      } catch (err) {
        if (err?.code === "23505" && err?.constraint === "users_phone_key") {
          throw new ConflictError("Phone number is already in use");
        }
        throw err;
      }
    }

    return getProfile(client, { customerId, userId });
  };
}
