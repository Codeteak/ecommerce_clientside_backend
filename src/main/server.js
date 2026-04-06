import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { toNodeHandler } from "better-auth/node";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { auth } from "../infra/auth/betterAuth.js";
import { createRoutes } from "../interface/http/routes/index.js";
import { notFound } from "../interface/http/middleware/notFound.js";
import { errorHandler } from "../interface/http/middleware/errorHandler.js";
import { createAppContext } from "./composition.js";
import { createGoogleOAuthDevStartHandler } from "../interface/http/googleOAuthDevStart.js";
import { oauthDevSuccessPage } from "../interface/http/oauthDevSuccessPage.js";

export function createServer() {
  const app = express();
  const ctx = createAppContext();

  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  );

  if (env.NODE_ENV === "development") {
    app.get("/oauth/success", oauthDevSuccessPage);
    app.get(
      `${env.BETTER_AUTH_BASE_PATH}/dev/google-start`,
      createGoogleOAuthDevStartHandler(env, auth)
    );
  }

  /**
   * Better Auth (e.g. Google OAuth). Must be mounted before `express.json()` or requests hang.
   * @see https://www.better-auth.com/docs/integrations/express
   */
  app.all(`${env.BETTER_AUTH_BASE_PATH}/*`, toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  app.use(createRoutes(ctx));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
