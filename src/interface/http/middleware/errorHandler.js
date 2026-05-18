import { AppError } from "../../../domain/errors/AppError.js";
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

export function errorHandler(err, req, res, _next) {
  if (isMalformedJsonBody(err)) {
    logApiWarn("api.validation.failed", req, {
      code: "INVALID_JSON",
      reason: "malformed_json",
      err: err.message
    });
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message:
          "Request body is not valid JSON. Remove stray characters after the final `}` (common in Postman raw body)."
      }
    });
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;

  if (!isAppError) {
    logApiError("api.error.unhandled", req, { code: "INTERNAL_ERROR", statusCode, err });
    captureApiError(req, err, statusCode);
  } else if (statusCode >= 500) {
    logApiError("api.error.app", req, { code: err.code, statusCode });
    captureApiError(req, err, statusCode);
  }

  res.status(statusCode).json({
    error: {
      code: isAppError ? err.code : "INTERNAL_ERROR",
      message: isAppError ? err.message : "Something went wrong",
      details: isAppError ? err.details : undefined
    }
  });
}
