// Purpose: This file defines the shop lookup methods used by repository implementations.
export class ShopLookupRepo {
  async findShopIdBySlug(_slug) {
    throw new Error("Not implemented");
  }

  async findShopIdByCustomDomain(_hostLower) {
    throw new Error("Not implemented");
  }

  async findShopIdByDomain(_domain) {
    throw new Error("Not implemented");
  }

  /**
   * @returns {Promise<{ id: string, name: string, shop_image_storage_key?: string | null } | null>}
   */
  async findShopByDomain(_domain) {
    throw new Error("Not implemented");
  }

  /**
   * @param {string} _shopId
   * @returns {Promise<{ id: string, name: string, shop_image_storage_key?: string | null } | null>}
   */
  async findShopBrandingById(_shopId) {
    throw new Error("Not implemented");
  }
}
