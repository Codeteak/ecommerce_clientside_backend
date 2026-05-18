import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "../../config/logger.js";

const storage = new AsyncLocalStorage();

/**
 * Run fn with request-scoped log bindings (HTTP and workers may omit context).
 * @param {{ requestId?: string, shopId?: string, userId?: string, customerId?: string }} context
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithRequestContext(context, fn) {
  return storage.run({ ...context }, fn);
}

/**
 * Merge fields into the current async context (e.g. after shop/auth middleware).
 * @param {{ requestId?: string, shopId?: string, userId?: string, customerId?: string }} partial
 */
export function patchRequestContext(partial) {
  const store = storage.getStore();
  if (!store) return;
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined && value !== null && value !== "") {
      store[key] = value;
    }
  }
}

export function getRequestContext() {
  return storage.getStore();
}

/** Logger with requestId/shopId when inside HTTP async context. */
export function getRequestLogger() {
  const store = storage.getStore();
  if (!store) return logger;
  /** @type {Record<string, string>} */
  const bindings = {};
  if (store.requestId) bindings.requestId = String(store.requestId);
  if (store.shopId) bindings.shopId = String(store.shopId);
  if (store.userId) bindings.userId = String(store.userId);
  if (store.customerId) bindings.customerId = String(store.customerId);
  return Object.keys(bindings).length ? logger.child(bindings) : logger;
}

/**
 * Express middleware: bind req.id into ALS for the remainder of the request.
 */
export function requestContextMiddleware(req, _res, next) {
  runWithRequestContext({ requestId: req.id }, () => next());
}
