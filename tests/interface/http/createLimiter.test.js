import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RedisStoreMock = vi.fn(function RedisStoreMock() {
  return { constructor: { name: "RedisStore" } };
});

const mockGetSharedRedisClient = vi.fn();

vi.mock("rate-limit-redis", () => ({
  RedisStore: RedisStoreMock
}));

vi.mock("../../../src/infra/redis/sharedRedis.js", () => ({
  getSharedRedisClient: () => mockGetSharedRedisClient()
}));

describe("createLimiter Redis store", () => {
  beforeEach(() => {
    vi.resetModules();
    RedisStoreMock.mockClear();
    mockGetSharedRedisClient.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("constructs RedisStore when REDIS_URL is set", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("DISABLE_RATE_LIMITING", "false");
    vi.stubEnv("NODE_ENV", "development");
    mockGetSharedRedisClient.mockReturnValue({ call: vi.fn() });

    const { getRateLimitStore, resetRateLimitStoreForTests } = await import(
      "../../../src/interface/http/middleware/createLimiter.js"
    );
    resetRateLimitStoreForTests();

    const store = getRateLimitStore();
    expect(RedisStoreMock).toHaveBeenCalledTimes(1);
    expect(RedisStoreMock.mock.calls[0][0]).toMatchObject({
      sendCommand: expect.any(Function)
    });
    expect(store).toBeDefined();
  });

  it("returns undefined store when REDIS_URL is unset", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("DISABLE_RATE_LIMITING", "false");
    vi.stubEnv("NODE_ENV", "test");
    mockGetSharedRedisClient.mockReturnValue(null);

    const { getRateLimitStore, resetRateLimitStoreForTests } = await import(
      "../../../src/interface/http/middleware/createLimiter.js"
    );
    resetRateLimitStoreForTests();

    expect(getRateLimitStore()).toBeUndefined();
    expect(RedisStoreMock).not.toHaveBeenCalled();
  });
});
