import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processOutboxBatch } from "../../src/application/services/outboxProcessor.js";

describe("processOutboxBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses one pool client for status updates in a batch", async () => {
    const updateClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn()
    };
    const claimedRow = {
      id: "11111111-1111-4111-8111-111111111111",
      event_type: "order.created",
      payload: { orderId: "o1" },
      retry_count: 0
    };
    const claimClient = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes("WITH claimed")) {
          return { rows: [claimedRow] };
        }
        return { rows: [] };
      }),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { column_name: "status" },
          { column_name: "retry_count" },
          { column_name: "processed_at" },
          { column_name: "event_type" },
          { column_name: "created_at" },
          { column_name: "id" },
          { column_name: "payload_json" }
        ]
      }),
      connect: vi
        .fn()
        .mockResolvedValueOnce(claimClient)
        .mockResolvedValueOnce(updateClient)
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handlers = {
      "order.created": vi.fn().mockRejectedValue(new Error("handler failed"))
    };

    const resultPromise = processOutboxBatch({
      pool,
      handlers,
      logger,
      batchSize: 1,
      maxRetries: 5,
      retryBaseMs: 1000,
      retryMaxMs: 30000,
      handlerTimeoutMs: 5000
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(updateClient.release).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(1);
  });
});
