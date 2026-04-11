/**
 * Purpose: This file creates a small cache helper for catalog reads.
 * It uses Redis when available, and safely falls back to no-cache mode
 * so catalog endpoints still work if Redis is disabled or unavailable.
 *
 * @param {{ redis: import("ioredis").default | null }} opts
 */
export function createCatalogCache({ redis }) {
  if (!redis) {
    return {
      async get(_key) {
        return null;
      },
      async set(_key, _value, _ttlSec) {},
      async wrap(_key, ttlSec, fn) {
        return fn();
      }
    };
  }

  function getClient() {
    return redis;
  }

  return {
    async get(key) {
      try {
        const c = getClient();
        const raw = await c.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async set(key, value, ttlSec) {
      try {
        const c = getClient();
        await c.set(key, JSON.stringify(value), "EX", ttlSec);
      } catch {
      }
    },

    async wrap(key, ttlSec, fn) {
      const hit = await this.get(key);
      if (hit != null) return hit;
      const v = await fn();
      await this.set(key, v, ttlSec);
      return v;
    }
  };
}
