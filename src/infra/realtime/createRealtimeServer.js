import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyStaffAccessToken } from "../auth/jwt.js";
import { env } from "../../config/env.js";

export function shopRoom(shopId) {
  return `shop:${shopId}`;
}

export function shopCatalogRoom(shopId) {
  return `shop:${shopId}:catalog`;
}

function waitForRedisReady(client, timeoutMs = 10_000) {
  if (client.status === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis duplicate not ready within ${timeoutMs}ms`));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("error", onError);
    };
    client.once("ready", onReady);
    client.once("error", onError);
  });
}

async function attachRedisAdapter(io, redis, logger) {
  const pubClient = redis.duplicate({ enableOfflineQueue: true });
  const subClient = redis.duplicate({ enableOfflineQueue: true });
  await Promise.all([waitForRedisReady(pubClient), waitForRedisReady(subClient)]);
  io.adapter(createAdapter(pubClient, subClient));
  logger?.info?.({ event: "realtime.redis_adapter.ready" }, "Socket.IO Redis adapter attached");
}

/**
 * Socket.IO on the API HTTP server with Redis adapter for multi-instance fanout.
 * Connect auth:
 * - Storefront browsers: shopId + STOREFRONT_CATALOG_REALTIME_TOKEN → catalog room only
 * - Staff/picker: staff JWT or REALTIME_CONNECT_TOKEN → shop room (order.placed)
 */
export async function createRealtimeServer(httpServer, { redis, logger }) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true }
  });

  if (redis) {
    try {
      await attachRedisAdapter(io, redis, logger);
    } catch (err) {
      logger?.warn?.(
        { err, event: "realtime.redis_adapter.failed" },
        "Socket.IO Redis adapter failed — running single-instance mode"
      );
    }
  }

  io.use((socket, next) => {
    const shopId = socket.handshake.auth?.shopId ?? socket.handshake.query?.shopId;
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;

    if (!shopId || String(shopId).trim() === "") {
      return next(new Error("shopId required"));
    }

    const storefrontCatalogToken = env.STOREFRONT_CATALOG_REALTIME_TOKEN;
    if (storefrontCatalogToken && token === storefrontCatalogToken) {
      socket.data.shopId = String(shopId);
      socket.data.connectionKind = "storefront";
      return next();
    }

    const connectToken = env.REALTIME_CONNECT_TOKEN;
    if (connectToken && token === connectToken) {
      socket.data.shopId = String(shopId);
      socket.data.connectionKind = "staff";
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
      socket.data.connectionKind = "staff";
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const isStorefront = socket.data.connectionKind === "storefront";
    const room = isStorefront ? shopCatalogRoom(socket.data.shopId) : shopRoom(socket.data.shopId);
    socket.join(room);
    logger?.info?.(
      {
        event: "realtime.socket.connected",
        shopId: socket.data.shopId,
        socketId: socket.id,
        role: socket.data.role,
        connectionKind: socket.data.connectionKind
      },
      isStorefront ? "Storefront catalog socket connected" : "Staff realtime socket connected"
    );
    socket.on("disconnect", (reason) => {
      logger?.debug?.(
        {
          event: "realtime.socket.disconnected",
          shopId: socket.data.shopId,
          connectionKind: socket.data.connectionKind,
          reason
        },
        "Realtime socket disconnected"
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
    emitCatalogInvalidated(payload) {
      const shopId = payload?.shopId;
      if (!shopId) {
        logger?.warn?.({ event: "realtime.emit.skipped", reason: "missing_shopId" });
        return;
      }
      const room = shopCatalogRoom(shopId);
      const event = { shopId: String(shopId) };
      if (Array.isArray(payload.productIds) && payload.productIds.length > 0) {
        event.productIds = payload.productIds.map((id) => String(id));
      }
      io.to(room).emit("catalog.invalidated", event);
      const socketsInRoom = io.sockets.adapter.rooms.get(room);
      logger?.debug?.(
        {
          event: "realtime.catalog_invalidated",
          shopId,
          subscriberCount: socketsInRoom?.size ?? 0
        },
        "Emitted catalog.invalidated"
      );
    },
    async close() {
      await new Promise((resolve) => io.close(() => resolve()));
    }
  };
}
