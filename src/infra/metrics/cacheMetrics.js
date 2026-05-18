/*
This file tracks cache hit and miss counters for runtime observability.
*/

import { incrementCachePromMetric } from "./prometheusRegistry.js";

const counters = {
  get_hit: 0,
  get_miss: 0,
  get_error: 0,
  set_ok: 0,
  set_error: 0,
  wrap_recompute: 0,
  lock_acquired: 0,
  lock_contended: 0
};

export function incrementCacheMetric(name) {
  if (!(name in counters)) return;
  counters[name] += 1;
  incrementCachePromMetric(name);
}

export function getCacheMetricsSnapshot() {
  return { ...counters };
}
