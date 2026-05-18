import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const prometheusRegistry = new Registry();

collectDefaultMetrics({ register: prometheusRegistry, prefix: "nodejs_" });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_class"],
  registers: [prometheusRegistry]
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_class"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [prometheusRegistry]
});

const cacheCounterDefs = [
  ["cache_get_hit_total", "Catalog cache get hits"],
  ["cache_get_miss_total", "Catalog cache get misses"],
  ["cache_get_error_total", "Catalog cache get errors"],
  ["cache_set_ok_total", "Catalog cache set successes"],
  ["cache_set_error_total", "Catalog cache set errors"],
  ["cache_wrap_recompute_total", "Catalog cache wrap recomputes"],
  ["cache_lock_acquired_total", "Catalog cache lock acquired"],
  ["cache_lock_contended_total", "Catalog cache lock contended"]
];

/** @type {Record<string, Counter<string>>} */
const cachePromCounters = {};
for (const [name, help] of cacheCounterDefs) {
  cachePromCounters[name] = new Counter({ name, help, registers: [prometheusRegistry] });
}

const cacheMetricToProm = {
  get_hit: "cache_get_hit_total",
  get_miss: "cache_get_miss_total",
  get_error: "cache_get_error_total",
  set_ok: "cache_set_ok_total",
  set_error: "cache_set_error_total",
  wrap_recompute: "cache_wrap_recompute_total",
  lock_acquired: "cache_lock_acquired_total",
  lock_contended: "cache_lock_contended_total"
};

export function incrementCachePromMetric(name) {
  const promName = cacheMetricToProm[name];
  if (promName && cachePromCounters[promName]) {
    cachePromCounters[promName].inc();
  }
}

const outboxCounterDefs = [
  ["outbox_claimed_total", "Outbox messages claimed"],
  ["outbox_processed_total", "Outbox messages processed"],
  ["outbox_retried_total", "Outbox messages retried"],
  ["outbox_failed_total", "Outbox messages failed"],
  ["outbox_dead_lettered_total", "Outbox messages dead-lettered"],
  ["outbox_handler_timeout_total", "Outbox handler timeouts"]
];

/** @type {Record<string, Counter<string>>} */
const outboxPromCounters = {};
for (const [name, help] of outboxCounterDefs) {
  outboxPromCounters[name] = new Counter({ name, help, registers: [prometheusRegistry] });
}

const outboxMetricToProm = {
  claimed: "outbox_claimed_total",
  processed: "outbox_processed_total",
  retried: "outbox_retried_total",
  failed: "outbox_failed_total",
  dead_lettered: "outbox_dead_lettered_total",
  handler_timeout: "outbox_handler_timeout_total"
};

export function addOutboxPromMetric(name, value = 1) {
  const promName = outboxMetricToProm[name];
  if (promName && outboxPromCounters[promName]) {
    outboxPromCounters[promName].inc(value);
  }
}

export async function getPrometheusMetricsText() {
  return prometheusRegistry.metrics();
}

export function getPrometheusContentType() {
  return prometheusRegistry.contentType;
}
