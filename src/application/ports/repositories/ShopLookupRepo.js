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
   * @returns {Promise<{
   *   id: string,
   *   name: string,
   *   domain?: string | null,
   *   custom_domain?: string | null,
   *   seo_title?: string | null,
   *   seo_description?: string | null,
   *   seo_keywords?: string | null,
   *   tagline?: string | null,
   *   locale?: string | null,
   *   theme_color?: string | null,
   *   og_image_storage_key?: string | null,
   *   og_image_alt?: string | null,
   *   twitter_card?: string | null,
   *   shop_image_storage_key?: string | null,
   *   banner_enabled?: boolean,
   *   banner_storage_keys?: string[]
   * } | null>}
   */
  async findShopByDomain(_domain) {
    throw new Error("Not implemented");
  }

  /**
   * @param {string} _shopId
   * @returns {Promise<{
   *   id: string,
   *   name: string,
   *   domain?: string | null,
   *   custom_domain?: string | null,
   *   seo_title?: string | null,
   *   seo_description?: string | null,
   *   seo_keywords?: string | null,
   *   tagline?: string | null,
   *   locale?: string | null,
   *   theme_color?: string | null,
   *   og_image_storage_key?: string | null,
   *   og_image_alt?: string | null,
   *   twitter_card?: string | null,
   *   shop_image_storage_key?: string | null,
   *   banner_enabled?: boolean,
   *   banner_storage_keys?: string[]
   * } | null>}
   */
  async findShopBrandingById(_shopId) {
    throw new Error("Not implemented");
  }
}
