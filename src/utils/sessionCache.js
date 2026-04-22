/*
This file stores and validates active user sessions using Redis so all servers share login state.
*/

import { withRetry } from "./withRetry.js";

function sessionKey(userId, sessionId) {
  return `session:${userId}:${sessionId}`;
}

export function createSessionCache({ redis }) {
  async function storeSession({ userId, sessionId, ttlMs }) {
    if (!redis || !userId || !sessionId || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    try {
      await withRetry(() => redis.set(sessionKey(userId, sessionId), "active", "EX", ttlSec), {
        event: "session_cache_set_retry",
        context: { userId }
      });
      return true;
    } catch {
      return false;
    }
  }

  async function validateSession({ userId, sessionId }) {
    if (!redis || !userId || !sessionId) return undefined;
    try {
      const v = await withRetry(() => redis.get(sessionKey(userId, sessionId)), {
        event: "session_cache_get_retry",
        context: { userId }
      });
      if (!v) return undefined;
      return v === "active";
    } catch {
      return undefined;
    }
  }

  async function deleteSession({ userId, sessionId }) {
    if (!redis || !userId || !sessionId) return false;
    try {
      await withRetry(() => redis.del(sessionKey(userId, sessionId)), {
        event: "session_cache_del_retry",
        context: { userId }
      });
      return true;
    } catch {
      return false;
    }
  }

  async function hasSession({ userId, sessionId }) {
    const v = await validateSession({ userId, sessionId });
    return v === true;
  }

  return {
    storeSession,
    validateSession,
    deleteSession,
    hasSession
  };
}
