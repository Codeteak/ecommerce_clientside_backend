/**
 * Purpose: Readiness probe — verifies database and cache (when configured) before traffic.
 */
export function createGetReadiness({
  pool,
  getRedis,
  skipRedisProbe = false,
  /** When true (e.g. unit test app without live DB), return ready without probing. */
  skipDepProbes = false
}) {
  return async function getReadiness() {
    const checks = {
      database: "unknown",
      redis: "skipped"
    };

    if (skipDepProbes) {
      checks.database = "ok";
      checks.redis = "skipped";
      return { status: "ready", service: "clientside-ecommerce-api", checks };
    }

    try {
      await pool.query("SELECT 1 AS ok");
      checks.database = "ok";
    } catch (err) {
      checks.database = "fail";
      const e = new Error("Database unavailable");
      e.statusCode = 503;
      e.checks = checks;
      e.cause = err;
      throw e;
    }

    if (skipRedisProbe) {
      checks.redis = "skipped";
      return { status: "ready", service: "clientside-ecommerce-api", checks };
    }

    const redis = typeof getRedis === "function" ? getRedis() : null;
    if (redis) {
      try {
        await redis.ping();
        checks.redis = "ok";
      } catch (err) {
        checks.redis = "fail";
        const e = new Error("Cache unavailable");
        e.statusCode = 503;
        e.checks = checks;
        e.cause = err;
        throw e;
      }
    }

    return { status: "ready", service: "clientside-ecommerce-api", checks };
  };
}
