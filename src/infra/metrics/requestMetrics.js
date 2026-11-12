// Purpose: HTTP request counters for the Prometheus scrape.
import {
  httpRequestDurationSeconds,
  httpRequestsTotal
} from "./prometheusRegistry.js";

export function routeKey(req) {
  const p = req.route?.path;
  if (p) return p;
  const u = req.originalUrl || req.url || "";
  const q = u.indexOf("?");
  return q >= 0 ? u.slice(0, q) : u;
}

export function statusClass(code) {
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  return "2xx";
}

/**
 * Counts requests after response finishes. Mount early in the Express stack.
 */
export function requestMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const rk = routeKey(req);
    const sc = statusClass(res.statusCode);
    const labels = { method: req.method, route: rk, status_class: sc };
    httpRequestsTotal.inc(labels);
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDurationSeconds.observe(labels, durationSec);
  });
  next();
}
