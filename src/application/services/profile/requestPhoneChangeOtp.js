import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { randomInt } from "node:crypto";
import { hashOtpCode } from "../../../infra/security/otpHasher.js";
import { logger } from "../../../config/logger.js";
import { shopAllowsCustomers } from "../auth/shopPolicy.js";
import {
  formatCustomerPhoneForSms,
  normalizeCustomerPhoneForStorage
} from "../../../domain/phone/normalizeCustomerPhone.js";

function randomSixDigitCode() {
  return String(randomInt(100000, 1000000));
}

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
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    if (await authRepo.isPhoneUsedByActiveShopStaff(client, newPhone)) {
      throw new ValidationError("Phone number is already in use");
    }
    if (await authRepo.isPhoneUsedByAnotherActiveCustomer(client, newPhone, userId)) {
      throw new ValidationError("Phone number is already in use");
    }

    const now = new Date();
    const latest = await authRepo.findLatestOtpChallenge(client, newPhone, shopId);
    if (latest && !latest.consumed_at) {
      const waitUntil = new Date(new Date(latest.created_at).getTime() + otpResendSeconds * 1000);
      if (waitUntil > now) {
        throw new ValidationError("OTP already sent recently. Please wait and try again.");
      }
    }

    const windowSinceIso = new Date(now.getTime() - otpRequestWindowSeconds * 1000).toISOString();
    const sentCount = await authRepo.countOtpChallengesSince(client, newPhone, shopId, windowSinceIso);
    if (sentCount >= otpMaxRequestsPerWindow) {
      throw new ValidationError("Too many OTP requests. Try again later.");
    }

    const code = randomSixDigitCode();
    const codeHash = await hashOtpCode(code);
    const expiresAtIso = new Date(now.getTime() + otpTtlSeconds * 1000).toISOString();

    const challenge = await authRepo.insertOtpChallenge(client, {
      phone: newPhone,
      shopId,
      codeHash,
      expiresAtIso
    });

    const shopLabel = String(shop.name || shop.slug || "our store").trim() || "our store";
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
