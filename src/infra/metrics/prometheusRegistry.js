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

const cacheLayers = ["catalog", "promo", "resolve", "meta"];
const cacheOpNames = [
  "get_hit",
  "get_miss",
  "get_error",
  "set_ok",
  "set_error",
  "wrap_recompute",
  "lock_acquired",
  "lock_contended"
];

/** @type {Record<string, Counter<string>>} */
const cachePromCounters = {};
for (const layer of cacheLayers) {
  for (const op of cacheOpNames) {
    const name = `cache_${layer}_${op}_total`;
    cachePromCounters[`${layer}:${op}`] = new Counter({
      name,
      help: `Cache ${op} (${layer})`,
      registers: [prometheusRegistry]
    });
  }
}

/** Legacy catalog-only names (same series as cache_catalog_*). */
const legacyCatalogAliases = {
  cache_get_hit_total: "catalog:get_hit",
  cache_get_miss_total: "catalog:get_miss",
  cache_get_error_total: "catalog:get_error",
  cache_set_ok_total: "catalog:set_ok",
  cache_set_error_total: "catalog:set_error",
  cache_wrap_recompute_total: "catalog:wrap_recompute",
  cache_lock_acquired_total: "catalog:lock_acquired",
  cache_lock_contended_total: "catalog:lock_contended"
};

/** @param {string} name @param {string} [layer] */
export function incrementCachePromMetric(name, layer = "catalog") {
  const key = `${layer}:${name}`;
  if (cachePromCounters[key]) {
    cachePromCounters[key].inc();
    return;
  }
  const legacy = legacyCatalogAliases[`cache_${name}_total`];
  if (layer === "catalog" && legacy && cachePromCounters[legacy]) {
    cachePromCounters[legacy].inc();
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
