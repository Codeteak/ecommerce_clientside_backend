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

  async listEligibleCouponsWithUsage(_client, _shopId, _customerId, _codeNormalized) {
    void _client;
    void _shopId;
    void _customerId;
    void _codeNormalized;
    throw new Error("Not implemented");
  }
}
