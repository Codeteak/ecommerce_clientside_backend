// Purpose: Root and health endpoints.

import { getMetricsSnapshot } from "../../../infra/metrics/requestMetrics.js";
import { env } from "../../../config/env.js";

export function mountCoreRoutes(r, deps) {
  const { healthGet, healthReadyGet } = deps;

  r.get("/", (_req, res) => {
    const body = {
      ok: true,
      service: "clientside-ecommerce-api",
      health: "/health",
      healthReady: "/health/ready",
      metrics: "/metrics"
    };
    if (env.ENABLE_API_DOCS) {
      body.openapi = "/openapi.json";
      body.swaggerUi = "/api-docs";
    }
    res.json(body);
  });

  r.get("/health", healthGet);
  r.get("/health/ready", healthReadyGet);

  r.get("/metrics", defaultMetricsGet);
}

function defaultMetricsGet(req, res) {
  if (env.METRICS_SCRAPE_TOKEN) {
    const auth = req.get("Authorization");
    const headerTok = req.get("X-Metrics-Token");
    const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const ok =
      bearer === env.METRICS_SCRAPE_TOKEN || headerTok === env.METRICS_SCRAPE_TOKEN;
    if (!ok) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Invalid or missing metrics scrape token" }
      });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(getMetricsSnapshot());
}
