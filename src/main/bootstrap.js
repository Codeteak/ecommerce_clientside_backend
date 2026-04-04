import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createServer } from "./server.js";

async function main() {
  const app = createServer();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
