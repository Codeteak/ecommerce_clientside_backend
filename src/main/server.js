// Purpose: This file creates and configures the Express app with middleware, routes, and error handlers.
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createRoutes } from "../interface/http/routes/index.js";
import { notFound } from "../interface/http/middleware/notFound.js";
import { errorHandler } from "../interface/http/middleware/errorHandler.js";
import { createAppContext } from "./composition.js";
import { requestMetricsMiddleware } from "../infra/metrics/requestMetrics.js";
import { requestContextMiddleware } from "../infra/logging/requestContext.js";
import { createCorsOriginDelegate } from "../infra/http/corsOrigin.js";

export function createExpressApp(ctx) {
  const isNoisePath = (url) =>
    url === "/health" ||
    url === "/health/ready" ||
    url === "/metrics";

  const app = express();
  app.set("trust proxy", env.TRUST_PROXY ? env.TRUST_PROXY_HOPS : false);

  app.disable("x-powered-by");
  app.use(
    helmet({
      // Storefront (localhost:3000) reads this API cross-origin. Helmet's default
      // same-origin resource policy makes browsers drop the response and report
      // a missing Access-Control-Allow-Origin header.
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );
  app.use(requestMetricsMiddleware);
  app.use(
    pinoHttp({
      logger,
      quietReqLogger: true,
      genReqId(req, res) {
        const incoming = req.headers["x-request-id"];
        const requestId =
          typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID();
        res.setHeader("x-request-id", requestId);
        return requestId;
      },
      autoLogging: {
        ignore(req) {
          return isNoisePath(req.url) || req.method === "OPTIONS";
        }
      },
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            ip: req.ip
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode
          };
        }
      },
      customLogLevel(req, res, err) {
        if (isNoisePath(req.url)) return "silent";
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage(req, _res) {
        return isNoisePath(req.url) ? "health.check" : "api.request.completed";
      },
      customReceivedMessage(req) {
        return isNoisePath(req.url) ? "health.check.started" : "api.request.started";
      },
      customErrorMessage() {
        return "api.request.completed";
      },
      customReceivedObject(req) {
        return {
          event: "api.request.started",
          requestId: req.id,
          method: req.method,
          route: req.route?.path || req.originalUrl,
          shopId: req.shopId,
          userId: req.customerAuth?.userId,
          customerId: req.customerAuth?.customerId
        };
      },
      customSuccessObject(req, res, val) {
        return {
          event: "api.request.completed",
          requestId: req.id,
          method: req.method,
          route: req.route?.path || req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(Number(val) || 0),
          shopId: req.shopId,
          userId: req.customerAuth?.userId,
          customerId: req.customerAuth?.customerId
        };
      },
      customErrorObject(req, res, err, val) {
        return {
          event: "api.request.completed",
          requestId: req.id,
          method: req.method,
          route: req.route?.path || req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(Number(val) || 0),
          shopId: req.shopId,
          userId: req.customerAuth?.userId,
          customerId: req.customerAuth?.customerId,
          err: err?.message
        };
      }
    })
  );
  app.use(requestContextMiddleware);

  app.use(
    cors({
      origin: createCorsOriginDelegate(env.CORS_ORIGIN, env.STOREFRONT_ROOT_DOMAIN),
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "accept",
        "content-type",
        "authorization",
        "x-shop-id",
        "x-tenant-id",
        "x-request-id",
        "x-metrics-token",
        "idempotency-key",
        // ngrok free returns a browser warning with no CORS headers unless this is sent.
        "ngrok-skip-browser-warning"
      ],
      optionsSuccessStatus: 204
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(ctx.shopResolver);
  app.use(createRoutes(ctx));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export function createServer() {
  const ctx = createAppContext();
  return createExpressApp(ctx);
}
