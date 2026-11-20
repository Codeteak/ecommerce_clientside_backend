/**
 * Session check used by customer JWT middleware.
 * CustomerAuthRepoPg implements this together with the other auth ports.
 */
export class CustomerSessionRepo {
  async isCustomerSessionValid(_userId, _customerId) {
    void _userId;
    void _customerId;
    throw new Error("Not implemented");
  }
}
