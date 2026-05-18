import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAccessTokenRegistry } from "../../src/infra/auth/accessTokenRegistry.js";

function createMockRedis() {
  const store = new Map();
  const sets = new Map();
  const runMulti = (ops) => {
    for (const op of ops) op();
  };
  return {
    multi() {
      const ops = [];
      const api = {
        set(key, val) {
          ops.push(() => store.set(key, val));
          return api;
        },
        sadd(key, member) {
          ops.push(() => {
            if (!sets.has(key)) sets.set(key, new Set());
            sets.get(key).add(member);
          });
          return api;
        },
        del(...keys) {
          for (const key of keys) {
            ops.push(() => {
              store.delete(key);
              sets.delete(key);
            });
          }
          return api;
        },
        expire() {
          return api;
        },
        exec: async () => runMulti(ops)
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
  });

  it("revokes a single jti", async () => {
    const registry = createAccessTokenRegistry({ redis });
    await registry.registerAccessJti("user-1", "jti-a", 120);
    await registry.revokeAccessJti("jti-a");
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
