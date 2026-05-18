import { ValidationError } from "../errors/ValidationError.js";
import { normalizePhoneForMsg91 } from "../../infra/msg91/msg91FlowSend.js";

/** Indian mobile: 10 digits, first digit 6–9. */
const INDIAN_MOBILE_10 = /^[6-9]\d{9}$/;

function assertValidIndianMobile10(mobile10) {
  if (!INDIAN_MOBILE_10.test(mobile10)) {
    throw new ValidationError(
      "Invalid phone number. Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9."
    );
  }
  return mobile10;
}

/**
 * Stores Indian mobile numbers as 10 digits (no country code).
 * Accepts +91 / 91 / 0-prefixed / plain 10-digit input.
 * After taking the last 10 digits, the first digit must be 6–9.
 */
export function normalizeCustomerPhoneForStorage(raw) {
  const digits = String(raw || "")
    .trim()
    .replace(/[\s\-()]/g, "")
    .replace(/\D/g, "");

  if (!digits) {
    throw new ValidationError(
      "Invalid phone number. Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9."
    );
  }

  let mobile10;
  if (digits.length === 12 && digits.startsWith("91")) {
    mobile10 = digits.slice(-10);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    mobile10 = digits.slice(1);
  } else if (digits.length === 10) {
    mobile10 = digits;
  } else if (digits.length > 10) {
    mobile10 = digits.slice(-10);
  } else {
    throw new ValidationError(
      "Invalid phone number. Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9."
    );
  }

  return assertValidIndianMobile10(mobile10);
}

/** MSG91 expects country code + number (e.g. 919876543210). */
export function formatCustomerPhoneForSms(phone10) {
  return normalizePhoneForMsg91(phone10);
}
