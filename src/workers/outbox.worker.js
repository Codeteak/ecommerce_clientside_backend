/*
Standalone outbox worker entry (optional). Default deploy runs the poller inside bootstrap.js.
*/

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../infra/db/pool.js";
import { startOutboxPoller } from "../infra/outbox/startOutboxPoller.js";
import { installFatalProcessHandlers } from "../utils/installFatalProcessHandlers.js";

installFatalProcessHandlers(logger, { skip: env.NODE_ENV === "test" });

const poller = startOutboxPoller({ pool, logger, embedded: false });

function requestStop(signal) {
  logger.info({ event: "outbox.worker.stopping", signal }, "Outbox worker shutdown requested");
  poller.stop();
}

process.once("SIGINT", () => requestStop("SIGINT"));
process.once("SIGTERM", () => requestStop("SIGTERM"));

poller.stopped
  .then(async () => {
    await pool.end();
  })
  .catch((err) => {
    logger.error({ event: "outbox.worker.fatal", err }, "Outbox worker fatal error");
    process.exit(1);
  });
