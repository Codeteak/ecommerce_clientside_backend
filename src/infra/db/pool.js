import pg from "pg";
import { env } from "../../config/env.js";

const { Pool } = pg;
const caPem =
  typeof env.DATABASE_SSL_CA_PEM === "string" && env.DATABASE_SSL_CA_PEM.trim()
    ? env.DATABASE_SSL_CA_PEM.replace(/\\n/g, "\n")
    : undefined;
const hasCustomCa = Boolean(caPem);
const rejectUnauthorized =
  env.NODE_ENV === "production"
    ? (hasCustomCa ? env.DATABASE_SSL_REJECT_UNAUTHORIZED : false)
    : env.DATABASE_SSL_REJECT_UNAUTHORIZED;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  ssl: rejectUnauthorized
    ? { rejectUnauthorized: true, ...(caPem ? { ca: caPem } : {}) }
    : { rejectUnauthorized: false }
});
