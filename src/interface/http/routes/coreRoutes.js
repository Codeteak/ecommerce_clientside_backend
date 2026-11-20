// Purpose: Root and health endpoints.

import {
  getPrometheusContentType,
  getPrometheusMetricsText
} from "../../../infra/metrics/prometheusRegistry.js";
import { env } from "../../../config/env.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";
import { asyncHandler } from "../asyncHandler.js";

export function mountCoreRoutes(r, deps) {
  const { healthGet, healthReadyGet } = deps;

  r.get("/health", healthGet);
  r.get("/health/ready", healthReadyGet);

  r.get("/metrics", asyncHandler(prometheusMetricsGet));
}

function assertMetricsAuth(req, next) {
  if (!env.METRICS_SCRAPE_TOKEN) {
    return true;
  }
  const auth = req.get("Authorization");
  const headerTok = req.get("X-Metrics-Token");
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const ok = bearer === env.METRICS_SCRAPE_TOKEN || headerTok === env.METRICS_SCRAPE_TOKEN;
  if (!ok) {
    next(
      new ForbiddenError("You don't have permission to perform this action.", {
        reason: "invalid_metrics_token"
      })
    );
    return false;
  }
  return true;
}

async function prometheusMetricsGet(req, res, next) {
  if (!assertMetricsAuth(req, next)) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", getPrometheusContentType());
  res.send(await getPrometheusMetricsText());
}
