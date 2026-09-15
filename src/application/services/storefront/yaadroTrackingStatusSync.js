/**
 * Pull Yaadro DMS tracking status into ecommerce `orders.status`
 * so storefront order history stays in sync without opening the tracking page.
 *
 * Tracking API: GET https://yaadro.com/track/api/tracking?token={token}
 * Token comes from delivery_tracking_url (.../tracking/{token}).
 */

const YAADRO_TRACKING_API =
  process.env.YAADRO_TRACKING_API_BASE?.trim() ||
  "https://yaadro.com/track/api/tracking";

const TERMINAL = new Set(["delivered", "cancelled", "rejected"]);

const STATUS_RANK = {
  pending: 0,
  accepted: 1,
  picking: 2,
  ready: 3,
  out_for_delivery: 4,
  delivered: 5
};

/**
 * @param {unknown} trackingUrl
 * @returns {string | null}
 */
export function extractYaadroTrackingToken(trackingUrl) {
  if (typeof trackingUrl !== "string") return null;
  const m = trackingUrl.trim().match(/\/tracking\/([^/?#]+)/i);
  const token = m?.[1]?.trim();
  return token || null;
}

/**
 * Map Yaadro `order_status` / delivered flag → ecommerce status.
 * Returns null when there is nothing useful to apply (e.g. still Pending).
 * @param {{ orderStatus?: unknown, delivered?: unknown }} input
 * @returns {'out_for_delivery' | 'delivered' | 'cancelled' | null}
 */
export function mapYaadroOrderStatusToEcommerce(input = {}) {
  if (input.delivered === true) return "delivered";
  const raw = String(input.orderStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return null;
  if (raw.includes("cancel")) return "cancelled";
  // Check OFD before "deliver*" — "out for delivery" contains "deliver".
  if (
    raw.includes("out for delivery") ||
    raw.includes("on the way") ||
    raw.includes("picked") ||
    raw.includes("assigned") ||
    raw.includes("dispatch") ||
    raw === "ofd"
  ) {
    return "out_for_delivery";
  }
  if (raw === "delivered" || raw.startsWith("delivered") || raw.includes("order delivered")) {
    return "delivered";
  }
  return null;
}

/**
 * @param {string} current
 * @param {string | null} next
 */
export function shouldUpgradeEcommerceStatus(current, next) {
  if (!next) return false;
  const from = String(current || "").trim().toLowerCase();
  const to = String(next).trim().toLowerCase();
  if (!from || from === to) return false;
  if (TERMINAL.has(from)) return false;
  if (to === "cancelled") return true;
  const a = STATUS_RANK[from];
  const b = STATUS_RANK[to];
  if (a == null || b == null) return false;
  return b > a;
}

/**
 * @param {string} token
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchYaadroTrackingStatus(token, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }
  const url = `${YAADRO_TRACKING_API}?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal
    });
    if (!res.ok) {
      throw new Error(`Yaadro tracking HTTP ${res.status}`);
    }
    const body = await res.json();
    const order = body?.data?.order ?? body?.order ?? null;
    return {
      orderStatus: order?.order_status ?? order?.orderStatus ?? null,
      delivered: body?.delivered === true || Boolean(order?.delivered_at),
      deliveredAt: order?.delivered_at ?? null
    };
  } finally {
    clearTimeout(timer);
  }
}

function timestampPatchForStatus(nextStatus, deliveredAt) {
  const now = new Date().toISOString();
  if (nextStatus === "delivered") {
    const parsed =
      typeof deliveredAt === "string" && deliveredAt.trim()
        ? new Date(deliveredAt)
        : null;
    const when = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : now;
    return { delivered_at: when };
  }
  if (nextStatus === "out_for_delivery") {
    return { out_for_delivery_at: now };
  }
  return {};
}

/**
 * Resolve desired ecommerce status from tracking URL (no DB).
 * @returns {Promise<string | null>}
 */
export async function resolveEcommerceStatusFromTrackingUrl(
  deliveryTrackingUrl,
  currentStatus,
  opts = {}
) {
  if (TERMINAL.has(String(currentStatus || "").toLowerCase())) return null;
  const token = extractYaadroTrackingToken(deliveryTrackingUrl);
  if (!token) return null;
  try {
    const snapshot = await fetchYaadroTrackingStatus(token, opts);
    const next = mapYaadroOrderStatusToEcommerce({
      orderStatus: snapshot.orderStatus,
      delivered: snapshot.delivered
    });
    if (!shouldUpgradeEcommerceStatus(currentStatus, next)) return null;
    return { next, deliveredAt: snapshot.deliveredAt };
  } catch {
    return null;
  }
}

/**
 * Persist a partner-like status upgrade from Yaadro tracking.
 * @returns {Promise<string | null>}
 */
export async function applyYaadroTrackingStatusUpgrade({
  client,
  orderRepo,
  shopId,
  orderId,
  nextStatus,
  deliveredAt
}) {
  if (!nextStatus) return null;
  const patch = timestampPatchForStatus(nextStatus, deliveredAt);
  const updated = await orderRepo.updateOrderStatus(
    client,
    shopId,
    orderId,
    nextStatus,
    patch
  );
  return updated ? nextStatus : null;
}

/**
 * Sync one order (fetch + DB update). Safe for a single shared client (sequential).
 */
export async function syncOrderStatusFromYaadroTracking({
  client,
  orderRepo,
  shopId,
  orderId,
  currentStatus,
  deliveryTrackingUrl,
  fetchImpl,
  timeoutMs
}) {
  const resolved = await resolveEcommerceStatusFromTrackingUrl(
    deliveryTrackingUrl,
    currentStatus,
    { fetchImpl, timeoutMs }
  );
  if (!resolved?.next) return null;
  return applyYaadroTrackingStatusUpgrade({
    client,
    orderRepo,
    shopId,
    orderId,
    nextStatus: resolved.next,
    deliveredAt: resolved.deliveredAt
  });
}

/**
 * Best-effort sync for storefront order rows.
 * Fetches Yaadro in parallel, then applies DB updates sequentially on one client.
 * Mutates `status` on each updated row.
 */
export async function syncStorefrontOrdersFromYaadroTracking({
  client,
  orderRepo,
  shopId,
  orders,
  fetchImpl,
  timeoutMs = 2500
}) {
  const list = Array.isArray(orders) ? orders : [];
  const candidates = list.filter((o) => {
    const status = String(o?.status || "").toLowerCase();
    return (
      o?.id &&
      !TERMINAL.has(status) &&
      extractYaadroTrackingToken(o.delivery_tracking_url || o.deliveryTrackingUrl)
    );
  });
  if (!candidates.length) return list;

  const resolutions = await Promise.all(
    candidates.map(async (row) => {
      const resolved = await resolveEcommerceStatusFromTrackingUrl(
        row.delivery_tracking_url || row.deliveryTrackingUrl,
        row.status,
        { fetchImpl, timeoutMs }
      );
      return { row, resolved };
    })
  );

  for (const { row, resolved } of resolutions) {
    if (!resolved?.next) continue;
    const next = await applyYaadroTrackingStatusUpgrade({
      client,
      orderRepo,
      shopId,
      orderId: row.id,
      nextStatus: resolved.next,
      deliveredAt: resolved.deliveredAt
    });
    if (next) row.status = next;
  }
  return list;
}
