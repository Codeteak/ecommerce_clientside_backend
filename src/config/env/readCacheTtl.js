/**
 * Effective TTL for Redis read caches (catalog, promos, shop resolve, service hub).
 * When CACHE_ON is false, returns 0 so callers skip cache without disabling REDIS_URL.
 *
 * @param {number | string | undefined} configuredTtlSec
 * @param {boolean} cacheOn
 * @returns {number}
 */
export function effectiveReadCacheTtlSec(configuredTtlSec, cacheOn) {
  if (!cacheOn) return 0;
  return Math.max(0, Number(configuredTtlSec) || 0);
}

/**
 * Snapshot for startup logs (structured + human summary).
 * @param {{
 *   CACHE_ON?: boolean,
 *   REDIS_URL?: string,
 *   STOREFRONT_CATALOG_CACHE_TTL_SEC?: number,
 *   STOREFRONT_PROMO_CACHE_TTL_SEC?: number,
 *   SHOP_RESOLVE_CACHE_TTL_SEC?: number,
 *   SHOP_SERVICE_AREA_CACHE_TTL_SEC?: number,
 *   STOREFRONT_CATALOG_HTTP_CACHE_SEC?: number
 * }} env
 */
export function buildReadCacheStartupStatus(env) {
  const cacheOn = env.CACHE_ON !== false;
  const redisConfigured = Boolean(String(env.REDIS_URL || "").trim());
  const promoConfiguredTtlSec =
    env.STOREFRONT_PROMO_CACHE_TTL_SEC > 0
      ? env.STOREFRONT_PROMO_CACHE_TTL_SEC
      : env.STOREFRONT_CATALOG_CACHE_TTL_SEC;

  const effectiveTtlSec = {
    catalog: effectiveReadCacheTtlSec(env.STOREFRONT_CATALOG_CACHE_TTL_SEC, cacheOn),
    promotions: effectiveReadCacheTtlSec(promoConfiguredTtlSec, cacheOn),
    shopResolve: effectiveReadCacheTtlSec(env.SHOP_RESOLVE_CACHE_TTL_SEC, cacheOn),
    shopServiceHub: effectiveReadCacheTtlSec(env.SHOP_SERVICE_AREA_CACHE_TTL_SEC, cacheOn),
    catalogHttpCacheControl: effectiveReadCacheTtlSec(
      env.STOREFRONT_CATALOG_HTTP_CACHE_SEC,
      cacheOn
    )
  };

  const readCachesActive = cacheOn && redisConfigured;

  return {
    cacheOn,
    redisConfigured,
    readCachesActive,
    effectiveTtlSec,
    summary: formatReadCacheStartupSummary({
      cacheOn,
      redisConfigured,
      readCachesActive,
      effectiveTtlSec
    })
  };
}

/**
 * @param {{
 *   cacheOn: boolean,
 *   redisConfigured: boolean,
 *   readCachesActive: boolean,
 *   effectiveTtlSec: Record<string, number>
 * }} status
 */
export function formatReadCacheStartupSummary(status) {
  const { cacheOn, redisConfigured, readCachesActive, effectiveTtlSec } = status;

  if (!redisConfigured) {
    return "REDIS_URL unset — read caches off; rate limits use in-memory store";
  }
  if (!cacheOn) {
    return "CACHE_ON=false — read caches off; Redis still used for rate limits and access jti";
  }

  const parts = [
    `catalog=${ttlLabel(effectiveTtlSec.catalog)}`,
    `promotions=${ttlLabel(effectiveTtlSec.promotions)}`,
    `resolve-by-domain=${ttlLabel(effectiveTtlSec.shopResolve)}`,
    `service-hub=${ttlLabel(effectiveTtlSec.shopServiceHub)}`,
    `http-cache-control=${ttlLabel(effectiveTtlSec.catalogHttpCacheControl)}`
  ];

  if (!readCachesActive) {
    return `CACHE_ON=true but caches inactive — ${parts.join(", ")}`;
  }

  return `read caches on — ${parts.join(", ")}`;
}

/** @param {number} ttlSec */
function ttlLabel(ttlSec) {
  return ttlSec > 0 ? `${ttlSec}s` : "off";
}
