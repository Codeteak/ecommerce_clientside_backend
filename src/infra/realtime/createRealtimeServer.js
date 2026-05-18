import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyStaffAccessToken } from "../auth/jwt.js";
import { env } from "../../config/env.js";

function shopRoom(shopId) {
  return `shop:${shopId}`;
}

/**
 * Socket.IO on the API HTTP server with Redis adapter for multi-instance fanout.
 * Connect auth: staff JWT (option A) or REALTIME_CONNECT_TOKEN (dev/staging).
 */
export async function createRealtimeServer(httpServer, { redis, logger }) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true }
  });

  if (redis) {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use((socket, next) => {
    const shopId = socket.handshake.auth?.shopId ?? socket.handshake.query?.shopId;
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;

    if (!shopId || String(shopId).trim() === "") {
      return next(new Error("shopId required"));
    }

    const connectToken = env.REALTIME_CONNECT_TOKEN;
    if (connectToken && token === connectToken) {
      socket.data.shopId = String(shopId);
      return next();
    }

    try {
      const payload = verifyStaffAccessToken(String(token || ""));
      if (payload.shopId != null && String(payload.shopId) !== String(shopId)) {
        return next(new Error("shopId does not match token"));
      }
      socket.data.shopId = String(shopId);
      socket.data.staffUserId = payload.sub;
      socket.data.role = payload.role;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const room = shopRoom(socket.data.shopId);
    socket.join(room);
    logger?.info?.(
      {
        event: "realtime.socket.connected",
        shopId: socket.data.shopId,
        socketId: socket.id,
        role: socket.data.role
      },
      "Picker socket connected"
    );
    socket.on("disconnect", (reason) => {
      logger?.debug?.(
        { event: "realtime.socket.disconnected", shopId: socket.data.shopId, reason },
        "Picker socket disconnected"
      );
    });
  });

  return {
    io,
    emitOrderPlaced(payload) {
      const shopId = payload?.shopId;
      if (!shopId) {
        logger?.warn?.({ event: "realtime.emit.skipped", reason: "missing_shopId" });
        return;
      }
      io.to(shopRoom(shopId)).emit("order.placed", payload);
      logger?.debug?.(
        { event: "realtime.order_placed", shopId, orderId: payload.orderId },
        "Emitted order.placed"
      );
    },
    async close() {
      await new Promise((resolve) => io.close(() => resolve()));
    }
  };
}
