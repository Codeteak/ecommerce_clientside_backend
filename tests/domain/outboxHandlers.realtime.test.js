import { describe, it, expect, vi } from "vitest";
import { createOutboxHandlers } from "../../src/application/services/outboxHandlers.js";
import { OUTBOX_EVENT_TYPES } from "../../src/application/constants/outboxEventTypes.js";

describe("outboxHandlers ORDER_PLACED_REALTIME", () => {
  it("calls emitOrderPlaced with payload", async () => {
    const emitOrderPlaced = vi.fn();
    const handlers = createOutboxHandlers({ emitOrderPlaced });
    const payload = {
      orderId: "o-1",
      shopId: "s-1",
      orderNumber: "1001",
      totalMinor: 5000,
      customerId: "c-1"
    };
    await handlers[OUTBOX_EVENT_TYPES.ORDER_PLACED_REALTIME](payload, {
      logger: { info: vi.fn() },
      eventId: "evt-1"
    });
    expect(emitOrderPlaced).toHaveBeenCalledWith(payload);
  });
});
