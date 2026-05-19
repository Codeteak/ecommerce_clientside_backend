import { env } from "../../config/env.js";
import { parseJwtDurationMinutes } from "../../config/env/parseJwtDurationMinutes.js";
import { withRetry } from "../../utils/withRetry.js";

function jtiKey(jti) {
  return `access:jti:${jti}`;
}

function userJtiSetKey(userId) {
  return `user:${userId}:access_jtis`;
}

export function accessTokenTtlSec() {
  const minutes = parseJwtDurationMinutes(env.JWT_ACCESS_EXPIRES_IN || env.JWT_EXPIRES_IN);
  if (minutes == null || minutes <= 0) return 3600;
  return Math.max(60, Math.ceil(minutes * 60));
}

/**
 * Redis allowlist for issued access-token jti values.
 */
export function createAccessTokenRegistry({ redis }) {
  const required = env.NODE_ENV === "production" && env.ACCESS_JTI_REDIS_REQUIRED !== false;

  async function registerAccessJti(userId, jti, ttlSec = accessTokenTtlSec()) {
    if (!redis || !userId || !jti) return false;
    const sec = Math.max(1, Number(ttlSec) || accessTokenTtlSec());
    try {
      await withRetry(
        async () => {
          const multi = redis.multi();
          multi.set(jtiKey(jti), String(userId), "EX", sec);
          multi.sadd(userJtiSetKey(userId), String(jti));
          multi.expire(userJtiSetKey(userId), sec);
          await multi.exec();
        },
        { event: "access_jti_register_retry", context: { userId } }
      );
      return true;
    } catch {
      return false;
    }
  }

  async function getAccessJtiStatus(jti) {
    if (!jti) return { active: false, reason: "missing_jti" };
    if (!redis) {
      return {
        active: !required,
        reason: required ? "redis_unavailable" : "redis_not_configured"
      };
    }
    try {
      const v = await withRetry(() => redis.exists(jtiKey(jti)), {
        event: "access_jti_exists_retry"
      });
      return Number(v) === 1
        ? { active: true, reason: "active" }
        : { active: false, reason: "jti_missing" };
    } catch {
      return {
        active: !required,
        reason: "redis_unavailable"
      };
    }
  }

  async function isAccessJtiActive(jti) {
    const status = await getAccessJtiStatus(jti);
    return status.active;
  }

  async function revokeAccessJti(jti) {
    if (!redis || !jti) return false;
    try {
      await withRetry(() => redis.del(jtiKey(jti)), { event: "access_jti_revoke_retry" });
      return true;
    } catch {
      return false;
    }
  }

  async function revokeAllAccessForUser(userId) {
    if (!redis || !userId) return false;
    try {
      const jtis = await redis.smembers(userJtiSetKey(userId));
      if (Array.isArray(jtis) && jtis.length) {
        const pipe = redis.multi();
        for (const jti of jtis) {
          pipe.del(jtiKey(jti));
        }
        pipe.del(userJtiSetKey(userId));
        await pipe.exec();
      } else {
        await redis.del(userJtiSetKey(userId));
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    registerAccessJti,
    getAccessJtiStatus,
    isAccessJtiActive,
    revokeAccessJti,
    revokeAllAccessForUser,
    required
  };
}
