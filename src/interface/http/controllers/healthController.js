import { asyncHandler } from "../asyncHandler.js";
import { getRequestLogger } from "../../../infra/logging/requestContext.js";

function getHandler(ctx) {
  return asyncHandler(async (_req, res) => {
    const body = await ctx.getHealth();
    res.json(body);
  });
}

function readyHandler(ctx) {
  return async (_req, res, _next) => {
    try {
      const body = await ctx.getReadiness();
      res.json(body);
    } catch (err) {
      const status = err.statusCode === 503 ? 503 : 500;
      getRequestLogger().error(
        { event: "api.health.not_ready", err, checks: err.checks },
        "Readiness probe failed"
      );
      // Dependency names and driver messages stay in the logs; probes only need the status.
      res.status(status).json({
        success: false,
        error: {
          code: "NOT_READY",
          message: "The service is temporarily unavailable. Please try again shortly."
        }
      });
    }
  };
}

export const healthController = {
  get: (ctx) => getHandler(ctx),
  ready: (ctx) => readyHandler(ctx),

  forCtx(ctx) {
    return { get: getHandler(ctx), ready: readyHandler(ctx) };
  }
};
