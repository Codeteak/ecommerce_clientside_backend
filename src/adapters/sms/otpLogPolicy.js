/**
 * Whether plaintext OTP may appear in server logs.
 * Production must never log codes; LOG_OTP_IN_DEV is also rejected by env schema in prod.
 *
 * @param {{ nodeEnv?: string, logOtpInDev?: boolean }} opts
 */
export function canLogOtpCode({ nodeEnv = "development", logOtpInDev = false } = {}) {
  return String(nodeEnv) !== "production" && Boolean(logOtpInDev);
}

/**
 * Mask a phone for structured logs (keep last 4 digits).
 * @param {unknown} phone
 */
export function maskPhoneForLog(phone) {
  const p = String(phone || "");
  if (p.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`;
}
