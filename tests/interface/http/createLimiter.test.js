import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RedisStoreMock = vi.fn(function RedisStoreMock() {
  return { constructor: { name: "RedisStore" } };
});

const mockGetSharedRedisClient = vi.fn();
const mockEnsureSharedRedisReady = vi.fn();

vi.mock("rate-limit-redis", () => ({
  RedisStore: RedisStoreMock
}));

vi.mock("../../../src/infra/redis/sharedRedis.js", () => ({
  getSharedRedisClient: () => mockGetSharedRedisClient(),
  ensureSharedRedisReady: () => mockEnsureSharedRedisReady()
}));

describe("createLimiter Redis store", () => {
  beforeEach(() => {
    vi.resetModules();
    RedisStoreMock.mockClear();
    mockGetSharedRedisClient.mockReset();
    mockEnsureSharedRedisReady.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("constructs one RedisStore per storeId when REDIS_URL is set", async () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("DISABLE_RATE_LIMITING", "false");
    vi.stubEnv("NODE_ENV", "development");
    mockGetSharedRedisClient.mockReturnValue({ status: "ready", call: vi.fn() });
    mockEnsureSharedRedisReady.mockResolvedValue({ status: "ready" });

    const {
      getRateLimitStore,
      resetRateLimitStoreForTests,
      warmupRateLimitRedis
    } = await import("../../../src/interface/http/middleware/createLimiter.js");
    resetRateLimitStoreForTests();
    await warmupRateLimitRedis();

    const a = getRateLimitStore("auth");
    const b = getRateLimitStore("otp-request");
    const aAgain = getRateLimitStore("auth");

    expect(RedisStoreMock).toHaveBeenCalledTimes(2);
    expect(RedisStoreMock.mock.calls[0][0]).toMatchObject({
      prefix: "rl:auth:",
      sendCommand: expect.any(Function)
    });
    expect(RedisStoreMock.mock.calls[1][0]).toMatchObject({
      prefix: "rl:otp-request:"
    });
    expect(a).toBe(aAgain);
    expect(a).not.toBe(b);
  });

  it("returns undefined store when REDIS_URL is unset", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("DISABLE_RATE_LIMITING", "false");
    vi.stubEnv("NODE_ENV", "test");
    mockGetSharedRedisClient.mockReturnValue(null);

    const { getRateLimitStore, resetRateLimitStoreForTests, warmupRateLimitRedis } = await import(
      "../../../src/interface/http/middleware/createLimiter.js"
    );
    resetRateLimitStoreForTests();
    await warmupRateLimitRedis();

    expect(getRateLimitStore("auth")).toBeUndefined();
    expect(RedisStoreMock).not.toHaveBeenCalled();
  });
});
