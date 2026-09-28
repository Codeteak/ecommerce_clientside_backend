import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { logger } from "../../../config/logger.js";
import { randomInt } from "node:crypto";
import { hashOtpCode } from "../../../infra/security/otpHasher.js";
import { assertShopAllowsCustomers } from "./shopPolicy.js";
import { assertOtpRequestAllowed } from "./assertOtpRequestAllowed.js";

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function randomSixDigitCode() {
  return String(randomInt(100000, 1000000));
}

export function createRequestCustomerEmailOtp({
  authRepo,
  otpSender,
  otpTtlSeconds = 300,
  otpResendSeconds = 60,
  otpRequestWindowSeconds = 900,
  otpMaxRequestsPerWindow = 3
}) {
  return async function requestCustomerEmailOtp(client, input) {
    const email = normalizeEmail(input.email);
    const shopId = input.shopId;

    const shop = await authRepo.getShopById(client, shopId);
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    assertShopAllowsCustomers(shop, { statusCode: 400 });

    const now = new Date();
    const latest = await authRepo.findLatestEmailOtpChallenge(client, email, shopId);
    const windowSinceIso = new Date(now.getTime() - otpRequestWindowSeconds * 1000).toISOString();
    const sentCount = await authRepo.countEmailOtpChallengesSince(client, email, shopId, windowSinceIso);

    assertOtpRequestAllowed({
      now,
      latestChallenge: latest,
      sentCountInWindow: sentCount,
      otpResendSeconds,
      otpRequestWindowSeconds,
      otpMaxRequestsPerWindow
    });

    const code = randomSixDigitCode();
    const codeHash = await hashOtpCode(code);
    const expiresAtIso = new Date(now.getTime() + otpTtlSeconds * 1000).toISOString();

    const challenge = await authRepo.insertEmailOtpChallenge(client, {
      email,
      shopId,
      codeHash,
      expiresAtIso
    });

    try {
      await otpSender.sendOtp({ to: email, code });
    } catch (err) {
      try {
        await authRepo.consumeEmailOtpChallenge(client, challenge.id);
      } catch (consumeErr) {
        logger.error(
          {
            event: "otp.email.challenge.consume_after_send_failed",
            challengeId: challenge.id,
            consumeErr: consumeErr?.message,
            originalErr: err?.message
          },
          "Failed to consume email OTP challenge after send error"
        );
      }
      throw err;
    }

    return {
      ok: true,
      message: "If eligible, an OTP has been sent."
    };
  };
}
