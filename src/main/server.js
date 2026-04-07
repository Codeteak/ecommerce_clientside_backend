// Purpose: This file creates and configures the Express app with middleware, routes, and error handlers.
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createRoutes } from "../interface/http/routes/index.js";
import { notFound } from "../interface/http/middleware/notFound.js";
import { errorHandler } from "../interface/http/middleware/errorHandler.js";
import { createAppContext } from "./composition.js";

export function createExpressApp(ctx) {
  const app = express();

  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

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
