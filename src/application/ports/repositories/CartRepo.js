/**
 * Purpose: This file defines the cart repository contract.
 * It declares cart-related methods used by application services,
 * while database adapters provide the actual implementation.
 */
export class CartRepo {
  async findCartByShopAndCustomerId(_client, _shopId, _customerIdText) {
    void _client;
    void _shopId;
    void _customerIdText;
    throw new Error("Not implemented");
  }

  async insertCart(_client, _shopId, _customerIdText) {
    void _client;
    void _shopId;
    void _customerIdText;
    throw new Error("Not implemented");
  }

  async listCartItems(_client, _shopId, _cartId) {
    void _client;
    void _shopId;
    void _cartId;
    throw new Error("Not implemented");
  }

  async insertCartItem(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async updateCartItemQuantity(_client, _shopId, _cartItemId, _quantity) {
    void _client;
    void _shopId;
    void _cartItemId;
    void _quantity;
    throw new Error("Not implemented");
  }

  async updateCartItemSnapshot(_client, _shopId, _cartItemId, _snapshot) {
    void _client;
    void _shopId;
    void _cartItemId;
    void _snapshot;
    throw new Error("Not implemented");
  }

  async deleteCartItem(_client, _shopId, _cartItemId) {
    void _client;
    void _shopId;
    void _cartItemId;
    throw new Error("Not implemented");
  }

  async deleteCartItemsForCart(_client, _shopId, _cartId) {
    void _client;
    void _shopId;
    void _cartId;
    throw new Error("Not implemented");
  }

  async deleteCart(_client, _shopId, _cartId) {
    void _client;
    void _shopId;
    void _cartId;
    throw new Error("Not implemented");
  }

  /**
   * Returns a product row for adding to cart, or null if missing / inactive / not in stock /
   * not linked to global_products (same sellable rules as checkout).
   */
  async getProductSnapshotForCart(_client, _shopId, _productId) {
    void _client;
    void _shopId;
    void _productId;
    throw new Error("Not implemented");
  }

  /**
   * Batch sellable product snapshots for cart prune/sync (same rules as getProductSnapshotForCart).
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   * @param {string[]} _productIds
   */
  async listProductSnapshotsForCart(_client, _shopId, _productIds) {
    void _client;
    void _shopId;
    void _productIds;
    throw new Error("Not implemented");
  }

  async updateCartCustomerId(_client, _shopId, _cartId, _newCustomerIdText) {
    void _client;
    void _shopId;
    void _cartId;
    void _newCustomerIdText;
    throw new Error("Not implemented");
  }

  async findCartItemWithCart(_client, _shopId, _itemId) {
    void _client;
    void _shopId;
    void _itemId;
    throw new Error("Not implemented");
  }

  async findMatchingCartItem(_client, _shopId, _cartId, _productId, _isCustom, _customNote) {
    void _client;
    void _shopId;
    void _cartId;
    void _productId;
    void _isCustom;
    void _customNote;
    throw new Error("Not implemented");
  }

  async listCartProductAvailability(_client, _shopId, _cartId) {
    void _client;
    void _shopId;
    void _cartId;
    throw new Error("Not implemented");
  }

  /**
   * Locks sellable shop_product rows (join global_products, active + in_stock) in one round-trip,
   * ordered by product id for stable lock ordering, verifies live price vs each cart line.
   * Call inside the checkout transaction before creating the order.
   */
  async validateCartForCheckoutCommit(_client, _shopId, _cartId) {
    void _client;
    void _shopId;
    void _cartId;
    throw new Error("Not implemented");
  }

  async listLiveProductPricingByIds(_client, _shopId, _productIds) {
    void _client;
    void _shopId;
    void _productIds;
    throw new Error("Not implemented");
  }
}
