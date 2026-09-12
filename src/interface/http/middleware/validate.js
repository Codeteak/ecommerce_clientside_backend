import { ZodError } from "zod";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { logApiWarn, zodIssuesSummary } from "../../../infra/logging/apiLog.js";

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        logApiWarn("api.validation.failed", req, {
          code: "VALIDATION_ERROR",
          issues: zodIssuesSummary(err.flatten())
        });
        next(new ValidationError("Please check the highlighted fields.", err.flatten()));
      } else {
        next(err);
      }
    }
  };
}
