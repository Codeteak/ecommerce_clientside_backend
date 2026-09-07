import { describe, it, expect, beforeEach } from "vitest";
import { createAccessTokenRegistry } from "../../src/infra/auth/accessTokenRegistry.js";

function createMockRedis() {
  const store = new Map();
  const sets = new Map();

  return {
    async eval(_script, _numKeys, setKey, sid, ttl, _max, sidKey, userId) {
      if (!sets.has(setKey)) sets.set(setKey, new Set());
      sets.get(setKey).add(sid);
      store.set(sidKey, userId);
      return [...sets.get(setKey)];
    },
    multi() {
      const ops = [];
      const api = {
        del(...keys) {
          for (const key of keys) {
            ops.push(() => {
              store.delete(key);
              sets.delete(key);
            });
          }
          return api;
        },
        srem(key, member) {
          ops.push(() => {
            sets.get(key)?.delete(member);
          });
          return api;
        },
        exec: async () => {
          for (const op of ops) op();
        }
      };
      return api;
    },
    async exists(key) {
      return store.has(key) ? 1 : 0;
    },
    async del(key) {
      store.delete(key);
      sets.delete(key);
    },
    async smembers(key) {
      return [...(sets.get(key) || [])];
    }
  };
}

describe("accessTokenRegistry", () => {
  let redis;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("registers and validates an access jti", async () => {
    const registry = createAccessTokenRegistry({ redis });
    await registry.registerAccessJti("user-1", "jti-a", 120);
    await expect(registry.isAccessJtiActive("jti-a")).resolves.toBe(true);
    await expect(registry.isAccessJtiActive("jti-missing")).resolves.toBe(false);
    await expect(registry.getAccessJtiStatus("jti-missing")).resolves.toMatchObject({
      active: false,
      reason: "jti_missing"
    });
  });

  it("revokes a single jti", async () => {
    const registry = createAccessTokenRegistry({ redis });
    await registry.registerAccessJti("user-1", "jti-a", 120);
    await registry.revokeAccessJti("jti-a", "user-1");
    await expect(registry.isAccessJtiActive("jti-a")).resolves.toBe(false);
  });

  it("revokes all access jtis for a user", async () => {
    const registry = createAccessTokenRegistry({ redis });
    await registry.registerAccessJti("user-1", "jti-a", 120);
    await registry.registerAccessJti("user-1", "jti-b", 120);
    await registry.revokeAllAccessForUser("user-1");
    await expect(registry.isAccessJtiActive("jti-a")).resolves.toBe(false);
    await expect(registry.isAccessJtiActive("jti-b")).resolves.toBe(false);
  });
});
