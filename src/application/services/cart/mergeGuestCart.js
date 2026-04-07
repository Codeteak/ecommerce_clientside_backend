/**
 * Purpose: This file creates a service that merges a guest cart
 * into a signed-in customer's cart after login for the same shop.
 */
export function createMergeGuestCart({ cartRepo }) {
  return async function mergeGuestCart(client, input) {
    const { shopId, sessionId, customerId } = input;
    if (!sessionId || !shopId || !customerId) return;
    const guestKey = `guest:${String(sessionId).trim()}`;
    await cartRepo.mergeGuestCartForShop(client, shopId, guestKey, String(customerId));
  };
}
