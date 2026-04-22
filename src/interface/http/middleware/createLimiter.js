// Purpose: Build express-rate-limit instances with shared options and the same 429 JSON body.

import rateLimit from "express-rate-limit";
import { env } from "../../../config/env.js";
import { sendTooManyRequests } from "../responses/httpResponses.js";

/**
 * @param {import("express-rate-limit").Options["keyGenerator"]} customKeyGenerator
 */
function withKeyGenerator(customKeyGenerator) {
  if (!customKeyGenerator) return undefined;
  return (req, res) => customKeyGenerator(req, res);
}

/**
 * @param {{
 *   windowMs: number,
 *   maxTest: number,
 *   maxProd: number,
 *   message: string,
 *   keyGenerator?: import("express-rate-limit").Options["keyGenerator"]
 * }} opts
 */
export function createLimiter({ windowMs, maxTest, maxProd, message, keyGenerator }) {
  if (env.DISABLE_RATE_LIMITING) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    max: env.NODE_ENV === "test" ? maxTest : maxProd,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: withKeyGenerator(keyGenerator),
    handler: (_req, res) => sendTooManyRequests(res, message)
  });
}
