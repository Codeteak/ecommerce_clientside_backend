import pino from "pino";
import { env } from "./env.js";

const level =
  env.NODE_ENV === "test"
    ? "silent"
    : env.NODE_ENV === "production"
      ? "info"
      : "debug";

export const logger = pino({
  level,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    remove: true
  }
});
