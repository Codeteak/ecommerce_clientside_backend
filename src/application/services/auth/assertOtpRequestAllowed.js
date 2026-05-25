import { ValidationError } from "../../../domain/errors/ValidationError.js";

/**
 * Enforces OTP send / resend limits for a phone or email + shop pair.
 *
 * @param {{
 *   now?: Date,
 *   latestChallenge: { consumed_at: string | null, created_at: string } | null,
 *   sentCountInWindow: number,
 *   otpResendSeconds: number,
 *   otpRequestWindowSeconds: number,
 *   otpMaxRequestsPerWindow: number
 * }} input
 */
export function assertOtpRequestAllowed({
  now = new Date(),
  latestChallenge,
  sentCountInWindow,
  otpResendSeconds,
  otpRequestWindowSeconds,
  otpMaxRequestsPerWindow
}) {
  if (latestChallenge && !latestChallenge.consumed_at) {
    const waitUntil = new Date(
      new Date(latestChallenge.created_at).getTime() + otpResendSeconds * 1000
    );
    if (waitUntil > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((waitUntil.getTime() - now.getTime()) / 1000)
      );
      throw new ValidationError("OTP already sent recently. Please wait and try again.", {
        reason: "resend_cooldown",
        retryAfterSeconds,
        resendCooldownSeconds: otpResendSeconds
      });
    }
  }

  if (sentCountInWindow >= otpMaxRequestsPerWindow) {
    throw new ValidationError("Too many OTP requests. Try again later.", {
      reason: "max_requests_per_window",
      maxRequestsPerWindow: otpMaxRequestsPerWindow,
      windowSeconds: otpRequestWindowSeconds,
      requestsUsed: sentCountInWindow
    });
  }
}
