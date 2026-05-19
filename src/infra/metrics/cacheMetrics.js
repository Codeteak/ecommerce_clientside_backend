/*
This file tracks cache hit and miss counters for runtime observability.
*/

import { incrementCachePromMetric } from "./prometheusRegistry.js";

const layers = ["catalog", "promo", "resolve", "meta"];

const counters = {};
for (const layer of layers) {
  counters[layer] = {
    get_hit: 0,
    get_miss: 0,
    get_error: 0,
    set_ok: 0,
    set_error: 0,
    wrap_recompute: 0,
    lock_acquired: 0,
    lock_contended: 0
  };
}

/** @param {string} name @param {string} [layer] */
export function incrementCacheMetric(name, layer = "catalog") {
  const bucket = counters[layer] ?? counters.catalog;
  if (!(name in bucket)) return;
  bucket[name] += 1;
  incrementCachePromMetric(name, layer);
}

export function getCacheMetricsSnapshot() {
  const out = { catalog: { ...counters.catalog } };
  for (const layer of layers) {
    if (layer !== "catalog") {
      out[layer] = { ...counters[layer] };
    }
  }
  return out;
}
