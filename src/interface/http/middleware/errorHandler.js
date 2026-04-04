import { AppError } from "../../../domain/errors/AppError.js";
import { logger } from "../../../config/logger.js";

export function errorHandler(err, _req, res, _next) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;

  if (!isAppError) {
    logger.error({ err }, "Unhandled error");
  }

  res.status(statusCode).json({
    error: {
      code: isAppError ? err.code : "INTERNAL_ERROR",
      message: isAppError ? err.message : "Something went wrong",
      details: isAppError ? err.details : undefined
    }
  });
}
