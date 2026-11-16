/** Session check only. JWT middleware cannot call profile or OTP methods. */
export function bindCustomerSessionRepo(authRepo) {
  return {
    isCustomerSessionValid: (userId, customerId) => authRepo.isCustomerSessionValid(userId, customerId)
  };
}

/** Profile, address, and phone methods used by signed-in account flows. */
export function bindCustomerProfileRepo(authRepo) {
  return {
    getCustomerProfileByCustomerId: (client, customerId) =>
      authRepo.getCustomerProfileByCustomerId(client, customerId),
    patchCustomerProfile: (client, patch) => authRepo.patchCustomerProfile(client, patch),
    clearCustomerAddress: (client, args) => authRepo.clearCustomerAddress(client, args),
    updateUserPhone: (client, userId, phone) => authRepo.updateUserPhone(client, userId, phone),
    getCustomerCreatedAtById: (client, customerId) => authRepo.getCustomerCreatedAtById(client, customerId),
    isPhoneUsedByAnotherActiveShopStaff: (client, phone, excludeUserId) =>
      authRepo.isPhoneUsedByAnotherActiveShopStaff(client, phone, excludeUserId),
    isPhoneUsedByAnotherActiveCustomer: (client, phone, excludeUserId) =>
      authRepo.isPhoneUsedByAnotherActiveCustomer(client, phone, excludeUserId)
  };
}

/** One-time code methods. Shop lookup stays outside this slice. */
export function bindCustomerOtpRepo(authRepo) {
  return {
    insertOtpChallenge: (client, row) => authRepo.insertOtpChallenge(client, row),
    getOtpRequestGate: (client, phone, shopId, sinceIso) =>
      authRepo.getOtpRequestGate(client, phone, shopId, sinceIso),
    countOtpChallengesSince: (client, phone, shopId, sinceIso) =>
      authRepo.countOtpChallengesSince(client, phone, shopId, sinceIso),
    findLatestOtpChallenge: (client, phone, shopId) =>
      authRepo.findLatestOtpChallenge(client, phone, shopId),
    listRecentOtpChallenges: (client, phone, shopId, limit) =>
      authRepo.listRecentOtpChallenges(client, phone, shopId, limit),
    incrementOtpChallengeAttempts: (client, challengeId) =>
      authRepo.incrementOtpChallengeAttempts(client, challengeId),
    consumeOtpChallenge: (client, challengeId) => authRepo.consumeOtpChallenge(client, challengeId)
  };
}
