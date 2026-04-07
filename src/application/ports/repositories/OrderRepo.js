/**
 * Purpose: This file defines the order repository contract.
 * It declares the order read/write methods used by services for
 * checkout, order history, queue updates, and outbox event writes.
 * Database adapters implement these methods.
 */
export class OrderRepo {
  async insertOrderWithItemsAndOutbox(_client, _payload) {
    void _client;
    void _payload;
    throw new Error("Not implemented");
  }

  async listOrdersForCustomer(_client, _shopId, _customerIdText) {
    void _client;
    void _shopId;
    void _customerIdText;
    throw new Error("Not implemented");
  }

  async getOrderByIdForCustomer(_client, _shopId, _orderId, _customerIdText) {
    void _client;
    void _shopId;
    void _orderId;
    void _customerIdText;
    throw new Error("Not implemented");
  }

  async listOrdersQueueForShop(_client, _shopId) {
    void _client;
    void _shopId;
    throw new Error("Not implemented");
  }

  async updateOrderStatus(_client, _shopId, _orderId, _newStatus, _timestampPatch) {
    void _client;
    void _shopId;
    void _orderId;
    void _newStatus;
    void _timestampPatch;
    throw new Error("Not implemented");
  }

  async insertOutboxEvent(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }
}
