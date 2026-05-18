import * as Sentry from "@sentry/node";
import { env } from "../../config/env.js";
import { getRequestContext } from "../logging/requestContext.js";

let enabled = false;

export function initSentry() {
  const dsn = String(env.SENTRY_DSN || "").trim();
  if (!dsn || env.NODE_ENV === "test") {
    return;
  }
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
    beforeSend(event) {
      const req = event.request;
      if (req?.headers) {
        delete req.headers.authorization;
        delete req.headers.cookie;
      }
      return event;
    }
  });
  enabled = true;
}

export function isSentryEnabled() {
  return enabled;
}

/**
 * Report API errors to Sentry with request correlation tags (no PII).
 * @param {import("express").Request} req
 * @param {unknown} err
 * @param {number} statusCode
 */
export function captureApiError(req, err, statusCode) {
  if (!enabled) return;
  const ctx = getRequestContext();
  Sentry.withScope((scope) => {
    const requestId = ctx?.requestId || req?.id;
    if (requestId) scope.setTag("requestId", String(requestId));
    if (req?.shopId) scope.setTag("shopId", String(req.shopId));
    if (req?.customerAuth?.userId) scope.setTag("userId", String(req.customerAuth.userId));
    if (req?.customerAuth?.customerId) scope.setTag("customerId", String(req.customerAuth.customerId));
    scope.setTag("statusCode", String(statusCode));
    if (err && typeof err === "object" && "code" in err && err.code) {
      scope.setTag("errorCode", String(err.code));
    }
    Sentry.captureException(err);
  });
}
