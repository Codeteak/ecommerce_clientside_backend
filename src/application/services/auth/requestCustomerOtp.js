import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { logger } from "../../../config/logger.js";
import { hashOtpCode } from "../../../infra/security/otpHasher.js";
import { generateOtpCode } from "../../../domain/auth/generateOtpCode.js";
import { assertShopAllowsCustomers } from "./shopPolicy.js";
import { assertOtpRequestAllowed } from "./assertOtpRequestAllowed.js";
import {
  formatCustomerPhoneForSms,
  normalizeCustomerPhoneForStorage
} from "../../../domain/phone/normalizeCustomerPhone.js";

/**
 * @param {{ authRepo: import("../../ports/repositories/auth/CustomerOtpRepo.js").CustomerOtpRepo }} deps
 */
export function createRequestCustomerOtp({
  authRepo,
  smsSender,
  otpTtlSeconds = 300,
  otpResendSeconds = 60,
  otpRequestWindowSeconds = 900,
  otpMaxRequestsPerWindow = 3
}) {
  return async function requestCustomerOtp(client, input) {
    const phone = normalizeCustomerPhoneForStorage(input.phone);
    const shopId = input.shopId;

    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    assertShopAllowsCustomers(shop, { statusCode: 400 });

    const now = new Date();
    const windowSinceIso = new Date(now.getTime() - otpRequestWindowSeconds * 1000).toISOString();
    const gate = await authRepo.getOtpRequestGate(client, phone, shopId, windowSinceIso);

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
      phone,
      shopId,
      codeHash,
      expiresAtIso
    });

    const shopLabel = String(shop.name || "our store").trim() || "our store";
    const phoneMasked =
      phone.length <= 4 ? "****" : `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
    try {
      await smsSender.sendOtp({ to: formatCustomerPhoneForSms(phone), code, shopName: shopLabel });
    } catch (err) {
      try {
        await authRepo.consumeOtpChallenge(client, challenge.id);
      } catch (consumeErr) {
        logger.error(
          {
            event: "otp.challenge.consume_after_send_failed",
            challengeId: challenge.id,
            shopId,
            phoneMasked,
            consumeErr: consumeErr?.message,
            originalErr: err?.message
          },
          "Failed to consume OTP challenge after SMS send error"
        );
      }
      throw err;
    }

    logger.info(
      {
        event: "api.auth.otp.request.ok",
        shopId,
        phoneMasked,
        challengeId: challenge.id
      },
      "Customer OTP request completed"
    );

    return {
      ok: true,
      message: "If eligible, an OTP has been sent."
    };
  };
}
