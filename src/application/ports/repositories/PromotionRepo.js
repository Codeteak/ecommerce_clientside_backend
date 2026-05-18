/**
 * Purpose: Promotion repository contract used by customer-facing
 * pricing and coupon workflows.
 */
export class PromotionRepo {
  async getShopPromotionSettings(_client, _shopId) {
    void _client;
    void _shopId;
    throw new Error("Not implemented");
  }

  /**
   * Eligible coupon rows for the shop window, including redemption counts and
   * `promotion_rules_public` (JSON array of customer-safe rule fields for benefits).
   */
  async listEligibleCouponsWithUsage(_client, _shopId, _customerId, _codeNormalized, _options = {}) {
    void _client;
    void _shopId;
    void _customerId;
    void _codeNormalized;
    void _options;
    throw new Error("Not implemented");
  }

  /**
   * Active campaign SKU overlays for storefront pricing (eligible promotions only).
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   * @param {string[]} _shopProductIds
   * @returns {Promise<Array<{ shop_product_id: string, promotion_id: string, promo_price_minor_per_unit: string, priority: number, overlap_mode: string | null, ends_at: Date }>>}
   */
  async listActivePromotionProductOverlaysForShopProducts(_client, _shopId, _shopProductIds) {
    void _client;
    void _shopId;
    void _shopProductIds;
    throw new Error("Not implemented");
  }

  /**
   * Active BXGY-style rules for eligible campaigns (shop-wide, capped).
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   */
  async listActiveBundleRulesForShop(_client, _shopId) {
    void _client;
    void _shopId;
    throw new Error("Not implemented");
  }

  /**
   * Bundle rules that may apply to one SKU (same_shop_product or matching global category).
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   * @param {string} _shopProductId
   * @param {string | null} _globalCategoryId
   */
  async listActiveBundleRulesForProduct(_client, _shopId, _shopProductId, _globalCategoryId) {
    void _client;
    void _shopId;
    void _shopProductId;
    void _globalCategoryId;
    throw new Error("Not implemented");
  }

  async findCouponByCodeForShop(_client, _shopId, _codeNormalized, _customerId) {
    void _client;
    void _shopId;
    void _codeNormalized;
    void _customerId;
    throw new Error("Not implemented");
  }

  async insertPromotionRedemption(_client, _payload) {
    void _client;
    void _payload;
    throw new Error("Not implemented");
  }
}
