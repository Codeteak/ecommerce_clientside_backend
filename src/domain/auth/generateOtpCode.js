import { randomInt } from "node:crypto";

/**
 * Cryptographic OTP code as a zero-padded digit string.
 * Default is 4 digits (1000–9999) for customer SMS OTP.
 * @param {number} [digits=4]
 */
export function generateOtpCode(digits = 4) {
  const n = Math.max(1, Math.min(10, Number(digits) || 4));
  const min = 10 ** (n - 1);
  const max = 10 ** n;
  return String(randomInt(min, max));
}
