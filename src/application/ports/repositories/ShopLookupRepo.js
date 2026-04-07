// Purpose: This file defines the shop lookup methods used by repository implementations.
export class ShopLookupRepo {
  async findShopIdBySlug(_slug) {
    throw new Error("Not implemented");
  }

  async findShopIdByCustomDomain(_hostLower) {
    throw new Error("Not implemented");
  }
}
