import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { logger } from "../../../config/logger.js";
import { randomInt } from "node:crypto";
import { hashOtpCode } from "../../../infra/security/otpHasher.js";
import { shopAllowsCustomers } from "./shopPolicy.js";

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
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }

    const now = new Date();
    const latest = await authRepo.findLatestEmailOtpChallenge(client, email, shopId);
    if (latest && !latest.consumed_at) {
      const waitUntil = new Date(new Date(latest.created_at).getTime() + otpResendSeconds * 1000);
      if (waitUntil > now) {
        throw new ValidationError("OTP already sent recently. Please wait and try again.");
      }
    }

    const windowSinceIso = new Date(now.getTime() - otpRequestWindowSeconds * 1000).toISOString();
    const sentCount = await authRepo.countEmailOtpChallengesSince(client, email, shopId, windowSinceIso);
    if (sentCount >= otpMaxRequestsPerWindow) {
      throw new ValidationError("Too many OTP requests. Try again later.");
    }

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
