/**
 * Profile, address, and phone writes for an already signed-in customer.
 * CustomerAuthRepoPg implements this together with the other auth ports.
 */
export class CustomerProfileRepo {
  async getCustomerProfileByCustomerId(_client, _customerId) {
    void _client;
    void _customerId;
    throw new Error("Not implemented");
  }

  async patchCustomerProfile(_client, _patch) {
    void _client;
    void _patch;
    throw new Error("Not implemented");
  }

  async clearCustomerAddress(_client, _args) {
    void _client;
    void _args;
    throw new Error("Not implemented");
  }

  async updateUserPhone(_client, _userId, _phone) {
    void _client;
    void _userId;
    void _phone;
    throw new Error("Not implemented");
  }

  /** @returns {Promise<{ created_at: string } | null>} */
  async getCustomerCreatedAtById(_client, _customerId) {
    void _client;
    void _customerId;
    throw new Error("Not implemented");
  }

  async isPhoneUsedByAnotherActiveShopStaff(_client, _phone, _excludeUserId) {
    void _client;
    void _phone;
    void _excludeUserId;
    throw new Error("Not implemented");
  }

  async isPhoneUsedByAnotherActiveCustomer(_client, _phone, _excludeUserId) {
    void _client;
    void _phone;
    void _excludeUserId;
    throw new Error("Not implemented");
  }
}
