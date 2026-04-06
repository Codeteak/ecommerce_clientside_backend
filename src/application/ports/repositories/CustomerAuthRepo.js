/**
 * @typedef {Object} ShopRow
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {boolean} is_active
 * @property {string} status
 * @property {boolean} is_blocked
 * @property {boolean} is_deleted
 */

/**
 * @typedef {Object} UserRow
 * @property {string} id
 * @property {string|null} email
 * @property {string|null} phone
 * @property {string|null} password_hash
 * @property {'password'|'google'} registration_source
 * @property {boolean} is_active
 */

/**
 * @typedef {Object} CustomerRow
 * @property {string} id
 * @property {string} user_id
 * @property {string|null} display_name
 * @property {boolean} is_blocked
 * @property {boolean} is_deleted
 */

/**
 * @typedef {Object} MembershipRow
 * @property {string} id
 * @property {string} shop_id
 * @property {string} customer_id
 * @property {boolean} is_active
 * @property {boolean} is_blocked
 * @property {boolean} is_deleted
 */

export class CustomerAuthRepo {
  /**
   * @param {import("pg").PoolClient} _client
   * @param {string} _shopId
   * @returns {Promise<ShopRow|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getShopById(_client, _shopId) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {string} _email
   * @returns {Promise<UserRow|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getUserByEmail(_client, _email) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {string} _userId
   * @returns {Promise<CustomerRow|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getCustomerByUserId(_client, _userId) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {string} _customerId
   * @param {string} _shopId
   * @returns {Promise<MembershipRow|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getMembershipByCustomerAndShop(_client, _customerId, _shopId) {
    throw new Error("Not implemented");
  }

  /**
   * Shop UUIDs the customer has an active membership for (login reference).
   * @param {import("pg").PoolClient} _client
   * @param {string} _customerId
   * @returns {Promise<string[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async listShopIdsForCustomer(_client, _customerId) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {{ email: string, password_hash: string|null, registration_source?: 'password'|'google' }} _row
   * @returns {Promise<{ id: string, email: string|null }>}
   */
  // eslint-disable-next-line no-unused-vars
  async insertUser(_client, _row) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {{ user_id: string, display_name: string|null }} _row
   * @returns {Promise<{ id: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async insertCustomer(_client, _row) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {{ shop_id: string, customer_id: string }} _row
   * @returns {Promise<{ id: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async insertMembership(_client, _row) {
    throw new Error("Not implemented");
  }

  /**
   * @param {import("pg").PoolClient} _client
   * @param {string} _membershipId
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async reactivateMembership(_client, _membershipId) {
    throw new Error("Not implemented");
  }
}
