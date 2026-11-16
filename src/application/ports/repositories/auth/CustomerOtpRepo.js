/**
 * One-time codes for customer login and phone change.
 * CustomerAuthRepoPg implements this together with the other auth ports.
 */
export class CustomerOtpRepo {
  async getShopById(_client, _shopId) {
    void _client;
    void _shopId;
    throw new Error("Not implemented");
  }

  async insertOtpChallenge(_client, _row) {
    void _client;
    void _row;
    throw new Error("Not implemented");
  }

  /**
   * Latest OTP challenge + count since window start (one round-trip).
   * @returns {Promise<{ latestChallenge: object | null, sentCountInWindow: number }>}
   */
  async getOtpRequestGate(_client, _phone, _shopId, _sinceIso) {
    void _client;
    void _phone;
    void _shopId;
    void _sinceIso;
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

  async listRecentOtpChallenges(_client, _phone, _shopId, _limit = 5) {
    void _client;
    void _phone;
    void _shopId;
    void _limit;
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
}
