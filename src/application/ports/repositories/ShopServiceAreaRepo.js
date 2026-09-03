export class ShopServiceAreaRepo {
  /**
   * Load shop status + hub coordinates from linked `addresses` row.
   * @param {string} _shopId
   * @returns {Promise<{
   *   id: string,
   *   status: string,
   *   service_area_radius_meters: number|null,
   *   hub_lat: number|null,
   *   hub_lng: number|null
   * }|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getShopHubForServiceCheck(_shopId) {
    throw new Error("Not implemented");
  }
}
