import pg from "pg";
import { env } from "../../config/env.js";

const { Pool } = pg;
function sanitizeConnectionString(raw) {
  try {
    const u = new URL(raw);
    // Prevent pg-connection-string sslmode semantics from overriding app-level ssl config.
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("sslcert");
    u.searchParams.delete("sslkey");
    u.searchParams.delete("sslrootcert");
    return u.toString();
  } catch {
    return raw;
  }
}

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
  connectionString: sanitizeConnectionString(env.DATABASE_URL),
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  ssl: rejectUnauthorized
    ? { rejectUnauthorized: true, ...(caPem ? { ca: caPem } : {}) }
    : { rejectUnauthorized: false }
});
