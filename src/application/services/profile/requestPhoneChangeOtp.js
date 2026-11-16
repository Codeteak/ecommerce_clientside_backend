import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { hashOtpCode } from "../../../infra/security/otpHasher.js";
import { generateOtpCode } from "../../../domain/auth/generateOtpCode.js";
import { logger } from "../../../config/logger.js";
import { assertShopAllowsCustomers } from "../auth/shopPolicy.js";
import { assertOtpRequestAllowed } from "../auth/assertOtpRequestAllowed.js";
import {
  formatCustomerPhoneForSms,
  normalizeCustomerPhoneForStorage
} from "../../../domain/phone/normalizeCustomerPhone.js";

/**
 * @param {{
 *   authRepo: import("../../ports/repositories/auth/CustomerProfileRepo.js").CustomerProfileRepo
 *     & import("../../ports/repositories/auth/CustomerOtpRepo.js").CustomerOtpRepo
 * }} deps
 */
export function createRequestPhoneChangeOtp({
  authRepo,
  smsSender,
  otpTtlSeconds = 300,
  otpResendSeconds = 60,
  otpRequestWindowSeconds = 900,
  otpMaxRequestsPerWindow = 3
}) {
  return async function requestPhoneChangeOtp(client, input) {
    const userId = input.userId;
    const customerId = input.customerId;
    const shopId = input.shopId;
    const newPhone = normalizeCustomerPhoneForStorage(input.newPhone);

    const profile = await authRepo.getCustomerProfileByCustomerId(client, customerId);
    if (!profile || profile.user_id !== userId) {
      throw new NotFoundError("Profile not found");
    }
    const currentPhone = profile.phone
      ? normalizeCustomerPhoneForStorage(profile.phone)
      : null;
    if (currentPhone === newPhone) {
      throw new ValidationError("New phone number must be different from current phone number");
    }

    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    assertShopAllowsCustomers(shop, { statusCode: 400 });

    if (await authRepo.isPhoneUsedByAnotherActiveShopStaff(client, newPhone, userId)) {
      throw new ValidationError("Phone number is already in use");
    }
    if (await authRepo.isPhoneUsedByAnotherActiveCustomer(client, newPhone, userId)) {
      throw new ValidationError("Phone number is already in use");
    }

    const now = new Date();
    const windowSinceIso = new Date(now.getTime() - otpRequestWindowSeconds * 1000).toISOString();
    const gate = await authRepo.getOtpRequestGate(client, newPhone, shopId, windowSinceIso);

    assertOtpRequestAllowed({
      now,
      latestChallenge: gate.latestChallenge,
      sentCountInWindow: gate.sentCountInWindow,
      otpResendSeconds,
      otpRequestWindowSeconds,
      otpMaxRequestsPerWindow
    });

    const code = generateOtpCode(4);
    const codeHash = await hashOtpCode(code);
    const expiresAtIso = new Date(now.getTime() + otpTtlSeconds * 1000).toISOString();

    const challenge = await authRepo.insertOtpChallenge(client, {
      phone: newPhone,
      shopId,
      codeHash,
      expiresAtIso
    });

    const shopLabel = String(shop.name || "our store").trim() || "our store";
    try {
      await smsSender.sendOtp({ to: formatCustomerPhoneForSms(newPhone), code, shopName: shopLabel });
    } catch (err) {
      try {
        await authRepo.consumeOtpChallenge(client, challenge.id);
      } catch (consumeErr) {
        logger.error(
          {
            event: "otp.phone_change.consume_after_send_failed",
            challengeId: challenge.id,
            consumeErr: consumeErr?.message,
            originalErr: err?.message
          },
          "Failed to consume phone-change OTP challenge after SMS send error"
        );
      }
      throw err;
    }

    return { ok: true, message: "If eligible, an OTP has been sent." };
  };
}
