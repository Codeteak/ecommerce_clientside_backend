import { AppError } from "../../../domain/errors/AppError.js";

/** Routes through `errorHandler` so unknown paths get the same envelope as everything else. */
export function notFound(_req, _res, next) {
  next(
    new AppError("We couldn't find what you were looking for.", {
      statusCode: 404,
      code: "ROUTE_NOT_FOUND"
    })
  );
}
