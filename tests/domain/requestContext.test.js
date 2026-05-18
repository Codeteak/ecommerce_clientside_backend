import { describe, it, expect } from "vitest";
import {
  getRequestLogger,
  patchRequestContext,
  runWithRequestContext
} from "../../src/infra/logging/requestContext.js";

describe("requestContext", () => {
  it("propagates requestId to child logger bindings in nested async calls", async () => {
    await runWithRequestContext({ requestId: "req-abc" }, async () => {
      const log = getRequestLogger();
      expect(log.bindings()).toMatchObject({ requestId: "req-abc" });

      await Promise.resolve();
      patchRequestContext({ shopId: "00000000-0000-4000-8000-000000000001" });
      expect(getRequestLogger().bindings()).toMatchObject({
        requestId: "req-abc",
        shopId: "00000000-0000-4000-8000-000000000001"
      });
    });
  });
});
