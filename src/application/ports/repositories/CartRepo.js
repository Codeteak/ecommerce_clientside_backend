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

  async getProductSnapshotForCart(_client, _shopId, _productId) {
    void _client;
    void _shopId;
    void _productId;
    throw new Error("Not implemented");
  }

  async updateCartCustomerId(_client, _shopId, _cartId, _newCustomerIdText) {
    void _client;
    void _shopId;
    void _cartId;
    void _newCustomerIdText;
    throw new Error("Not implemented");
  }

  async mergeGuestCartForShop(_client, _shopId, _guestCustomerIdText, _customerUuidText) {
    void _client;
    void _shopId;
    void _guestCustomerIdText;
    void _customerUuidText;
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
}
