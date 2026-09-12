import { randomUUID } from "node:crypto";
import { getSharedRedisClient } from "../../../infra/redis/sharedRedis.js";

const CART_TTL_SEC = 60 * 60 * 24 * 30;
const memoryByShopCustomer = new Map();
const memoryByCartId = new Map();
const memoryByItemId = new Map();

function shopCustomerKey(shopId, customerId) {
  return `${shopId}:${customerId}`;
}

function redisShopCustomerKey(shopId, customerId) {
  return `storefront:cart:sc:${shopId}:${customerId}`;
}

function redisCartIdKey(cartId) {
  return `storefront:cart:id:${cartId}`;
}

function clone(record) {
  return record ? structuredClone(record) : null;
}

/**
 * Legacy Redis/memory cart helpers.
 * Storefront cart writes are retired (localStorage + checkout items).
 * Load/delete remain for clearing leftover session keys after checkout.
 */
export async function loadCartByShopCustomer(shopId, customerId) {
  const sc = shopCustomerKey(shopId, customerId);
  const redis = getSharedRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(redisShopCustomerKey(shopId, customerId));
      if (raw) {
        const parsed = JSON.parse(raw);
        indexItems(parsed);
        memoryByShopCustomer.set(sc, clone(parsed));
        memoryByCartId.set(String(parsed.id), clone(parsed));
        return parsed;
      }
    } catch {
      // fall through to memory
    }
  }
  return clone(memoryByShopCustomer.get(sc) ?? null);
}

export async function loadCartById(cartId) {
  const redis = getSharedRedisClient();
  if (redis) {
    try {
      const pointer = await redis.get(redisCartIdKey(cartId));
      if (pointer) {
        const [shopId, customerId] = String(pointer).split(":");
        if (shopId && customerId) return loadCartByShopCustomer(shopId, customerId);
      }
    } catch {
      // fall through
    }
  }
  return clone(memoryByCartId.get(String(cartId)) ?? null);
}

function indexItems(record) {
  for (const item of record.items || []) {
    memoryByItemId.set(String(item.id), String(record.id));
  }
}

function dropItemIndex(record) {
  for (const item of record.items || []) {
    memoryByItemId.delete(String(item.id));
  }
}

export async function loadCartByItemId(itemId) {
  const cartId = memoryByItemId.get(String(itemId));
  if (cartId) return loadCartById(cartId);
  return null;
}

export async function saveCart(record) {
  dropItemIndex(memoryByCartId.get(String(record.id)) || record);
  const sc = shopCustomerKey(record.shop_id, record.customer_id);
  memoryByShopCustomer.set(sc, clone(record));
  memoryByCartId.set(String(record.id), clone(record));
  indexItems(record);
  const redis = getSharedRedisClient();
  if (!redis) return;
  try {
    const payload = JSON.stringify(record);
    await redis.set(redisShopCustomerKey(record.shop_id, record.customer_id), payload, "EX", CART_TTL_SEC);
    await redis.set(
      redisCartIdKey(record.id),
      shopCustomerKey(record.shop_id, record.customer_id),
      "EX",
      CART_TTL_SEC
    );
  } catch {
    // memory already updated
  }
}

export async function deleteCartRecord(record) {
  if (!record) return;
  dropItemIndex(record);
  memoryByShopCustomer.delete(shopCustomerKey(record.shop_id, record.customer_id));
  memoryByCartId.delete(String(record.id));
  const redis = getSharedRedisClient();
  if (!redis) return;
  try {
    await redis.del(redisShopCustomerKey(record.shop_id, record.customer_id));
    await redis.del(redisCartIdKey(record.id));
  } catch {
    // ignore
  }
}

export function newCartRecord(shopId, customerId) {
  return {
    id: randomUUID(),
    shop_id: shopId,
    customer_id: String(customerId),
    created_at: new Date().toISOString(),
    items: []
  };
}

export function newCartItem(row) {
  return {
    id: randomUUID(),
    cart_id: row.cartId,
    shop_id: row.shopId,
    product_id: row.productId ?? null,
    title_snapshot: row.titleSnapshot,
    quantity: String(row.quantity),
    unit_size_snapshot: String(row.unitSizeSnapshot ?? "1"),
    unit_label: row.unitLabel,
    unit_price_minor: Number(row.unitPriceMinor),
    is_custom: Boolean(row.isCustom),
    custom_note: row.customNote ?? null
  };
}
