/**
 * Purpose: This file defines the customer auth repository contract.
 * It lists methods used for customer login, registration, memberships,
 * and profile updates, while adapters implement the database logic.
 */

export class CustomerAuthRepo {
  async getShopById(_client, _shopId) {
    void _client;
    void _shopId;
    throw new Error("Not implemented");
  }

  async isCustomerSessionValid(_userId, _customerId) {
    void _userId;
    void _customerId;
    throw new Error("Not implemented");
  }

  async getUserById(_client, _userId) {
    void _client;
    void _userId;
    throw new Error("Not implemented");
  }

  async getUserByEmail(_client, _email) {
    void _client;
    void _email;
    throw new Error("Not implemented");
  }

  async getUserByPhone(_client, _phone) {
    void _client;
    void _phone;
    throw new Error("Not implemented");
  }

  async isEmailUsedByActiveShopStaff(_client, _email) {
    void _client;
    void _email;
    throw new Error("Not implemented");
  }

  async isPhoneUsedByActiveShopStaff(_client, _phone) {
    void _client;
    void _phone;
    throw new Error("Not implemented");
  }

  async isUserActiveShopStaff(_client, _userId) {
    void _client;
    void _userId;
    throw new Error("Not implemented");
  }

  async getCustomerByUserId(_client, _userId) {
    void _client;
    void _userId;
    throw new Error("Not implemented");
  }

  async getMembershipByCustomerAndShop(_client, _customerId, _shopId) {
    void _client;
    void _customerId;
    void _shopId;
    throw new Error("Not implemented");
  }

  async listShopIdsForCustomer(_client, _customerId) {
    void _client;
    void _customerId;
    throw new Error("Not implemented");
  }

  async listActiveShopsForCustomer(_client, _customerId) {
    void _client;
    void _customerId;
    throw new Error("Not implemented");
  }

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

  async insertUser(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async insertOtpChallenge(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async countOtpChallengesSince(_client, _phone, _shopId, _sinceIso) {
    void _client;
    void _phone;
    void _shopId;
    void _sinceIso;
    throw new Error("Not implemented");
  }

  async findLatestOtpChallenge(_client, _phone, _shopId) {
    void _client;
    void _phone;
    void _shopId;
    throw new Error("Not implemented");
  }

  async incrementOtpChallengeAttempts(_client, _challengeId) {
    void _client;
    void _challengeId;
    throw new Error("Not implemented");
  }

  async consumeOtpChallenge(_client, _challengeId) {
    void _client;
    void _challengeId;
    throw new Error("Not implemented");
  }

  async insertEmailOtpChallenge(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async countEmailOtpChallengesSince(_client, _email, _shopId, _sinceIso) {
    void _client;
    void _email;
    void _shopId;
    void _sinceIso;
    throw new Error("Not implemented");
  }

  async findLatestEmailOtpChallenge(_client, _email, _shopId) {
    void _client;
    void _email;
    void _shopId;
    throw new Error("Not implemented");
  }

  async incrementEmailOtpChallengeAttempts(_client, _challengeId) {
    void _client;
    void _challengeId;
    throw new Error("Not implemented");
  }

  async consumeEmailOtpChallenge(_client, _challengeId) {
    void _client;
    void _challengeId;
    throw new Error("Not implemented");
  }

  async insertCustomer(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async insertMembership(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  /**
   * Ensures a membership row exists for (shop, customer): insert or reactivate soft-deleted /
   * inactive rows. Preserves `is_blocked` on update so shop bans are not cleared by OTP.
   * @returns {Promise<{ id: string, shop_id: string, customer_id: string, is_active: boolean, is_blocked: boolean, is_deleted: boolean }>}
   */
  async upsertCustomerShopMembership(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  async reactivateMembership(_client, _membershipId) {
    void _client;
    void _membershipId;
    throw new Error("Not implemented");
  }

  async updateUserPhone(_client, _userId, _phone) {
    void _client;
    void _userId;
    void _phone;
    throw new Error("Not implemented");
  }
}
