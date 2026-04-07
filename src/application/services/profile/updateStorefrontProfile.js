import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

/**
 * Purpose: This file updates storefront profile data for a customer.
 * It verifies profile ownership and updates customer display name
 * and user phone fields when new values are provided.
 */
export function createUpdateStorefrontProfile({ authRepo }) {
  return async function updateStorefrontProfile(client, { userId, customerId, displayName, phone }) {
    const c = await authRepo.getCustomerProfileByCustomerId(client, customerId);
    if (!c || c.user_id !== userId) {
      throw new NotFoundError("Profile not found");
    }
    if (displayName !== undefined) {
      await client.query(`UPDATE customers SET display_name = $1, updated_at = now() WHERE id = $2`, [
        displayName,
        customerId
      ]);
    }
    if (phone !== undefined) {
      await authRepo.updateUserPhone(client, userId, phone ?? null);
    }
  };
}
