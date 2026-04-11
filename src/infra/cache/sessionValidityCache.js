/**
 * Purpose: Short-TTL in-memory cache for customer session validity to cut DB round-trips.
 * Tradeoff: revocation/blocking may take up to ttlMs to take effect for cached "valid" rows.
 *
 * @param {{ ttlMs: number, maxEntries?: number }} opts
 */
export function createSessionValidityCache({ ttlMs, maxEntries = 5000 }) {
  if (ttlMs <= 0) {
    return {
      get(_key) {
        return undefined;
      },
      set(_key, _valid) {}
    };
  }

  /** @type {Map<string, { valid: boolean, expiresAt: number }>} */
  const cache = new Map();

  function evictIfOverLimit() {
    if (cache.size <= maxEntries) return;
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
      if (cache.size <= maxEntries * 0.75) return;
    }
    let n = 0;
    const drop = cache.size - Math.floor(maxEntries * 0.75);
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++n >= drop) break;
    }
  }

  return {
    /**
     * @param {string} key
     * @returns {boolean | undefined} undefined if unknown/expired
     */
    get(key) {
      const e = cache.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) {
        cache.delete(key);
        return undefined;
      }
      return e.valid;
    },

    /**
     * @param {string} key
     * @param {boolean} valid
     */
    set(key, valid) {
      evictIfOverLimit();
      cache.set(key, { valid, expiresAt: Date.now() + ttlMs });
    }
  };
}
