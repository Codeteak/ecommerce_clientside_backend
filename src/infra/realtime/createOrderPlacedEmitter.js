/**
 * Emits order.placed to shop rooms via Redis (API server or outbox worker).
 */
export async function createOrderPlacedEmitter({ redis, logger }) {
  if (!redis) {
    return {
      emitOrderPlaced() {},
      async close() {}
    };
  }

  const { Emitter } = await import("@socket.io/redis-emitter");
  const emitterRedis = redis.duplicate();
  const emitter = new Emitter(emitterRedis);

  return {
    emitOrderPlaced(payload) {
      const shopId = payload?.shopId;
      if (!shopId) {
        logger?.warn?.({ event: "realtime.emit.skipped", reason: "missing_shopId" });
        return;
      }
      emitter.to(`shop:${shopId}`).emit("order.placed", payload);
      logger?.debug?.(
        { event: "realtime.order_placed", shopId, orderId: payload.orderId },
        "Emitted order.placed"
      );
    },
    async close() {
      try {
        await emitterRedis.quit();
      } catch {
        /* ignore */
      }
    }
  };
}
