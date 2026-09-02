import pino from "pino";
import { env } from "./env.js";

const defaultLevel =
  env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug";
const level = process.env.LOG_LEVEL?.trim() || defaultLevel;

const isDevelopment = env.NODE_ENV === "development";

const options = {
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.refreshToken",
      "req.body.code",
      "req.body.phone",
      "req.body.newPhone",
      "req.body.email",
      "phone",
      "email",
      "otp",
      "DATABASE_URL"
    ],
    remove: true
  }
};

if (isDevelopment) {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      colorizeObjects: true,
      levelFirst: true,
      customColors:
        "trace:gray,debug:cyan,info:green,warn:yellow,error:red,fatal:bgRed,bold",
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: false,
      messageFormat:
        "{if event}\x1b[90m[{event}]\x1b[0m {end}{msg}"
    }
  };
}

export const logger = pino(options);
export default logger;
