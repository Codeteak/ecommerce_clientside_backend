/**
 * Logs and exits on unhandled rejections / uncaught exceptions (API and worker processes).
 * @param {import("pino").Logger} logger
 * @param {{ skip?: boolean }} [opts]
 */
export function installFatalProcessHandlers(logger, opts = {}) {
  if (opts.skip) return;

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason, event: "process.unhandled_rejection" }, "Unhandled promise rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.error({ err, event: "process.uncaught_exception" }, "Uncaught exception");
    process.exit(1);
  });
}
