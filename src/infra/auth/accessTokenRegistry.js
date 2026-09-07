import { env } from "../../config/env.js";
import { parseJwtDurationMinutes } from "../../config/env/parseJwtDurationMinutes.js";
import { withRetry } from "../../utils/withRetry.js";

/**
 * Redis allowlist for access-token session ids — same model as shop admin:
 * key `auth:session:customer:{userId}` = SET of active `sid` / `jti` values.
 * Plus per-sid key for fast exists checks (TTL = access token lifetime).
 */

const MAX_CUSTOMER_SESSIONS = 20;
const SESSION_SCOPE = "customer";

function sessionSetKey(userId) {
  return `auth:session:${SESSION_SCOPE}:${userId}`;
}

function sidKey(sid) {
  return `access:jti:${sid}`;
}

const ADD_SESSION_WITH_CAP_LUA = `
local k = KEYS[1]
local sid = ARGV[1]
local ttl = tonumber(ARGV[2])
local maxSessions = tonumber(ARGV[3])
local sidKey = ARGV[4]
local userId = ARGV[5]
local t = redis.call('TYPE', k)
if type(t) == 'table' then t = t['ok'] end
if t ~= 'none' and t ~= 'set' then
  redis.call('DEL', k)
end
if sid == nil or sid == '' then
  return {}
end
redis.call('SADD', k, sid)
redis.call('SET', sidKey, userId, 'EX', ttl)
if ttl and ttl > 0 then
  redis.call('EXPIRE', k, ttl)
end
local count = redis.call('SCARD', k)
if maxSessions and maxSessions > 0 and count > maxSessions then
  local overflow = count - maxSessions
  for i = 1, overflow do
    local dropped = redis.call('SPOP', k)
    if dropped then
      redis.call('DEL', 'access:jti:' .. dropped)
    end
  end
end
return redis.call('SMEMBERS', k)
`;

export function accessTokenTtlSec() {
  const minutes = parseJwtDurationMinutes(env.JWT_ACCESS_EXPIRES_IN || env.JWT_EXPIRES_IN);
  if (minutes == null || minutes <= 0) return 3600;
  return Math.max(60, Math.ceil(minutes * 60));
}

/**
 * Redis allowlist for issued access-token jti / sid values (admin-compatible).
 */
export function createAccessTokenRegistry({ redis }) {
  const required = env.NODE_ENV === "production" && env.ACCESS_JTI_REDIS_REQUIRED !== false;

  async function registerAccessJti(userId, jti, ttlSec = accessTokenTtlSec()) {
    if (!redis || !userId || !jti) return false;
    const sec = Math.max(1, Number(ttlSec) || accessTokenTtlSec());
    const sid = String(jti);
    try {
      await withRetry(
        async () => {
          await redis.eval(
            ADD_SESSION_WITH_CAP_LUA,
            1,
            sessionSetKey(userId),
            sid,
            String(sec),
            String(MAX_CUSTOMER_SESSIONS),
            sidKey(sid),
            String(userId)
          );
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
      const v = await withRetry(() => redis.exists(sidKey(jti)), {
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

  async function revokeAccessJti(jti, userId = null) {
    if (!redis || !jti) return false;
    try {
      await withRetry(async () => {
        const pipe = redis.multi();
        pipe.del(sidKey(jti));
        if (userId) {
          pipe.srem(sessionSetKey(userId), String(jti));
        }
        await pipe.exec();
      }, { event: "access_jti_revoke_retry" });
      return true;
    } catch {
      return false;
    }
  }

  async function revokeAllAccessForUser(userId) {
    if (!redis || !userId) return false;
    try {
      const setKey = sessionSetKey(userId);
      const jtis = await redis.smembers(setKey);
      if (Array.isArray(jtis) && jtis.length) {
        const pipe = redis.multi();
        for (const jti of jtis) {
          pipe.del(sidKey(jti));
        }
        pipe.del(setKey);
        // Legacy key from older registry
        pipe.del(`user:${userId}:access_jtis`);
        await pipe.exec();
      } else {
        await redis.del(setKey);
        await redis.del(`user:${userId}:access_jtis`);
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
