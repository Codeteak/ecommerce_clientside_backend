// Purpose: Shared error vocabulary and the safety rules that decide what a user may be told.
// Mirrors `yaadro-ecommerce-admin-web-backend/src/shared/kernel/error-codes.ts` so both
// services speak the same language. Domain codes (COUPON_EXPIRED, CART_EMPTY, …) are NOT
// listed here — modules keep their own and supply their own message.

export const ErrorCodes = Object.freeze({
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",

  // Authentication
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",

  // Authorization
  FORBIDDEN: "FORBIDDEN",
  INSUFFICIENT_PERMISSION: "INSUFFICIENT_PERMISSION",

  // Resource
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Network / infrastructure
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  SERVER_ERROR: "SERVER_ERROR",

  // Rate limiting
  RATE_LIMITED: "RATE_LIMITED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // Fallback
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR"
});

const STATUS_MESSAGES = Object.freeze({
  400: "We couldn't process that request. Please check your information.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to perform this action.",
  404: "The requested information could not be found.",
  409: "This information already exists or has changed. Please refresh and try again.",
  410: "This feature is no longer available.",
  413: "That upload is too large. Please use a smaller file.",
  422: "Please check the highlighted fields.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "The service is temporarily unavailable. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
  504: "The service is temporarily unavailable. Please try again shortly."
});

const STATUS_PHRASES = new Set([
  "bad request",
  "unauthorized",
  "forbidden",
  "not found",
  "conflict",
  "gone",
  "payload too large",
  "unprocessable entity",
  "too many requests",
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "error",
  "unknown error"
]);

/**
 * A message is only safe to show if a human wrote it. Bare codes, status phrases,
 * driver text and stack-ish strings must fall back to the status default.
 *
 * @param {unknown} message
 * @returns {boolean}
 */
export function isHumanReadableMessage(message) {
  if (typeof message !== "string") return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (/^[A-Z0-9_]+$/.test(trimmed)) return false;
  // Real user copy is a sentence; a single token is a label or a code.
  if (!/\s/.test(trimmed)) return false;
  if (STATUS_PHRASES.has(trimmed.toLowerCase().replace(/[.!]+$/, ""))) return false;
  if (/\bat\s+\w+\s+\(/.test(trimmed)) return false;
  if (/(select|insert|update|delete)\s+.*\s+from\s+/i.test(trimmed)) return false;
  if (/duplicate key value|violates .* constraint|relation ".*" does not exist/i.test(trimmed)) {
    return false;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(trimmed)) return false;
  return true;
}

/** @param {number} statusCode */
export function messageForStatus(statusCode) {
  return STATUS_MESSAGES[statusCode] || "Something went wrong. Please try again.";
}

/**
 * Pick the first message a user can actually act on, else the status default.
 *
 * @param {ReadonlyArray<unknown>} candidates
 * @param {number} statusCode
 */
export function resolveUserMessage(candidates, statusCode) {
  for (const candidate of candidates) {
    if (isHumanReadableMessage(candidate)) return candidate.trim();
  }
  return messageForStatus(statusCode);
}

/**
 * Normalize validation detail into one shape: `{ fieldErrors, formErrors }`.
 * Accepts a raw Zod `flatten()` result or the legacy `{ issues: flatten() }` wrapper.
 *
 * @param {unknown} details
 */
export function normalizeErrorDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;

  const source =
    details.issues && typeof details.issues === "object" ? details.issues : details;

  if (source.fieldErrors || source.formErrors) {
    return {
      fieldErrors: source.fieldErrors || {},
      formErrors: Array.isArray(source.formErrors) ? source.formErrors : []
    };
  }
  return details;
}
