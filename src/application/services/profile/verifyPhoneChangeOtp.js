import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { AuthError } from "../../../domain/errors/AuthError.js";
import { ConflictError } from "../../../domain/errors/ConflictError.js";
import { verifyOtpCode } from "../../../infra/security/otpHasher.js";
import { normalizeCustomerPhoneForStorage } from "../../../domain/phone/normalizeCustomerPhone.js";

export function createVerifyPhoneChangeOtp({ authRepo, buildStorefrontSession, otpMaxAttempts = 5 }) {
  return async function verifyPhoneChangeOtp(client, input) {
    const userId = input.userId;
    const customerId = input.customerId;
    const shopId = input.shopId;
    const newPhone = normalizeCustomerPhoneForStorage(input.newPhone);
    const code = String(input.code || "").trim();
    const ip = input.ip ?? null;
    const userAgent = input.userAgent ?? null;

    if (!/^\d{6}$/.test(code)) {
      throw new ValidationError("OTP code must be 6 digits");
    }

    const profile = await authRepo.getCustomerProfileByCustomerId(client, customerId);
    if (!profile || profile.user_id !== userId) {
      throw new NotFoundError("Profile not found");
    }

    if (await authRepo.isPhoneUsedByAnotherActiveShopStaff(client, newPhone, userId)) {
      throw new ConflictError("Phone number is already in use");
    }
    if (await authRepo.isPhoneUsedByAnotherActiveCustomer(client, newPhone, userId)) {
      throw new ConflictError("Phone number is already in use");
    }

    const challenge = await authRepo.findLatestOtpChallenge(client, newPhone, shopId);
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= new Date()) {
      throw new AuthError("Invalid or expired OTP");
    }
    if (Number(challenge.attempts) >= otpMaxAttempts) {
      await authRepo.consumeOtpChallenge(client, challenge.id);
      throw new AuthError("Invalid or expired OTP");
    }

    const ok = await verifyOtpCode(code, challenge.code_hash);
    if (!ok) {
      const updated = await authRepo.incrementOtpChallengeAttempts(client, challenge.id);
      if (updated && Number(updated.attempts) >= otpMaxAttempts) {
        await authRepo.consumeOtpChallenge(client, challenge.id);
      }
      throw new AuthError("Invalid or expired OTP");
    }

    await authRepo.consumeOtpChallenge(client, challenge.id);
    try {
      await authRepo.updateUserPhone(client, userId, newPhone);
    } catch (err) {
      if (err?.code === "23505" && err?.constraint === "users_phone_key") {
        throw new ConflictError("Phone number is already in use");
      }
      throw err;
    }

    const session = await buildStorefrontSession(client, userId, {
      ip,
      userAgent
    });
    return {
      ok: true,
      message: "Phone number updated successfully",
      ...session
    };
  };
}
