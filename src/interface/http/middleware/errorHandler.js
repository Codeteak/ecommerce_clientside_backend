import { AppError } from "../../../domain/errors/AppError.js";
import {
  ErrorCodes,
  messageForStatus,
  normalizeErrorDetails,
  resolveUserMessage
} from "../../../domain/errors/errorCodes.js";
import { logApiError, logApiWarn } from "../../../infra/logging/apiLog.js";
import { captureApiError } from "../../../infra/observability/sentry.js";

/** express.json() / body-parser: invalid JSON body (e.g. trailing character in Postman raw body). */
function isMalformedJsonBody(err) {
  return (
    err instanceof SyntaxError &&
    (err.status === 400 || err.statusCode === 400) &&
    typeof err.body === "string"
  );
}

/**
 * PostgreSQL constraint violations that escaped repository translation. Mapping them here
 * means they surface with a business meaning instead of an opaque 500, and the driver's
 * message (which names tables and constraints) never reaches the client.
 */
function translatePgError(err) {
  switch (err?.code) {
    case "23505":
      return new AppError(
        "This information already exists or has changed. Please refresh and try again.",
        { statusCode: 409, code: ErrorCodes.ALREADY_EXISTS }
      );
    case "23503":
      return new AppError("This item is still linked to other records and cannot be changed.", {
        statusCode: 409,
        code: ErrorCodes.CONFLICT
      });
    case "23514":
    case "22P02":
      return new AppError("We couldn't process that request. Please check your information.", {
        statusCode: 400,
        code: ErrorCodes.VALIDATION_ERROR
      });
    default:
      return null;
  }
}

export function errorHandler(err, req, res, _next) {
  if (isMalformedJsonBody(err)) {
    logApiWarn("api.validation.failed", req, {
      code: "INVALID_JSON",
      reason: "malformed_json",
      err: err.message
    });
    return respond(req, res, 400, {
      code: "INVALID_JSON",
      message:
        "Request body is not valid JSON. Remove stray characters after the final `}` (common in Postman raw body)."
    });
  }

  const appError = err instanceof AppError ? err : translatePgError(err);
  const statusCode = appError ? appError.statusCode : 500;

  if (!appError) {
    logApiError("api.error.unhandled", req, { code: "INTERNAL_ERROR", statusCode, err });
    captureApiError(req, err, statusCode);
  } else {
    if (!(err instanceof AppError)) {
      logApiWarn("api.error.database", req, { code: appError.code, statusCode, pgCode: err?.code });
    }
    if (statusCode >= 500) {
      logApiError("api.error.app", req, { code: appError.code, statusCode });
      captureApiError(req, err, statusCode);
    }
  }

  return respond(req, res, statusCode, {
    code: appError ? appError.code : "INTERNAL_ERROR",
    // Internal failures never echo their own message; business errors keep theirs.
    message: appError ? resolveUserMessage([appError.message], statusCode) : messageForStatus(500),
    details: appError ? normalizeErrorDetails(appError.details) : undefined
  });
}

function respond(req, res, statusCode, { code, message, details }) {
  const requestId = typeof req?.id === "string" && req.id ? req.id : undefined;
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    ...(requestId ? { requestId } : {})
  });
}
