/*
This file tracks outbox worker processing counters for observability.
*/

import { addOutboxPromMetric } from "./prometheusRegistry.js";

const counters = {
  claimed: 0,
  processed: 0,
  retried: 0,
  failed: 0,
  dead_lettered: 0,
  handler_timeout: 0
};

export function addOutboxMetric(name, value = 1) {
  if (!(name in counters)) return;
  const n = Number(value) || 0;
  counters[name] += n;
  addOutboxPromMetric(name, n);
}

export function getOutboxMetricsSnapshot() {
  return { ...counters };
}
