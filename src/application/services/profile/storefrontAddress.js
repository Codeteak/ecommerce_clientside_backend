/**
 * Storefront address read and write. The HTTP layer keeps the 204 and 404 responses.
 * @param {{ authRepo: import("../../ports/repositories/auth/CustomerProfileRepo.js").CustomerProfileRepo }} deps
 */
export function createStorefrontAddress({ authRepo }) {
  return {
    async getAddress(client, customerId) {
      const profile = await authRepo.getCustomerProfileByCustomerId(client, customerId);
      return { address: profile?.address ?? null };
    },

    async patchAddress(client, { customerId, userId, addressPatch }) {
      const result = await authRepo.patchCustomerProfile(client, { customerId, userId, addressPatch });
      return { created: result?.created === true };
    },

    async clearAddress(client, { customerId, userId }) {
      return authRepo.clearCustomerAddress(client, { customerId, userId });
    }
  };
}
