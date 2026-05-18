import { AuthError } from "../../../domain/errors/AuthError.js";
import { ConflictError } from "../../../domain/errors/ConflictError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { getCustomerProfile } from "./getCustomerProfile.js";
import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";

/**
 * Purpose: Partially update display name and/or nested address fields; returns the same shape as GET.
 */
export function updateCustomerProfile({ authRepo }) {
  const getProfile = getCustomerProfile({ authRepo });

  return async function execute(client, { customerId, userId, patch }) {
    const existing = await authRepo.getCustomerProfileByCustomerId(client, customerId);
    if (!existing || existing.user_id !== userId) {
      throw new NotFoundError("Profile not found");
    }
    if (existing.is_blocked || existing.is_deleted) {
      throw new AuthError("Invalid credentials");
    }

    const addressPatch =
      patch.address !== undefined && patch.address != null && Object.keys(patch.address).length > 0
        ? patch.address
        : undefined;

    const displayName = patch.displayName !== undefined ? patch.displayName : patch.name;
    const hasDisplay = displayName !== undefined;
    const hasAddress = addressPatch !== undefined;
    const hasPhone = patch.phone !== undefined;
    const hasEmail = patch.email !== undefined;

    if (hasDisplay || hasAddress) {
      await authRepo.patchCustomerProfile(client, {
        customerId,
        userId,
        displayName,
        addressPatch
      });
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
    if (hasEmail) {
      try {
        await authRepo.updateUserEmail(client, userId, patch.email ?? null);
      } catch (err) {
        if (err?.code === "23505" && err?.constraint === "users_email_key") {
          throw new ConflictError("Email is already in use");
        }
        throw err;
      }
    }

    return getProfile(client, { customerId, userId });
  };
}
