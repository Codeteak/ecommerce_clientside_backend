/**
 * Purpose: This file defines valid order statuses and the allowed
 * status changes between them so order state updates stay consistent.
 */
export const ORDER_STATUS_TRANSITIONS = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["picking", "cancelled"],
  picking: ["ready"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: []
};

export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "picking",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "rejected"
];

export function canTransitionOrderStatus(from, to) {
  const next = ORDER_STATUS_TRANSITIONS[from];
  return Boolean(next && next.includes(to));
}
