/*
This file defines outbox event type constants used by the worker.
*/

export const OUTBOX_EVENT_TYPES = Object.freeze({
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_PLACED_REALTIME: "ORDER_PLACED_REALTIME"
});
