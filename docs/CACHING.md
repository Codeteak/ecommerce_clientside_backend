# API caching reference

Redis/Valkey backs shared caches when `REDIS_URL` is set. Catalog and promotion keys are versioned per shop via `shop:{shopId}:catalogGen` (bump with `POST /storefront/catalog/cache/invalidate`).

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_URL` | (empty dev) | Required in production |
| `ACCESS_JTI_DB_FALLBACK_ENABLED` | `true` | Protected APIs use DB session validation if access `jti` is missing/unavailable in Redis |
| `STOREFRONT_CATALOG_CACHE_TTL_SEC` | `60` | Catalog SWR + promotion query cache TTL |
| `STOREFRONT_PROMO_CACHE_TTL_SEC` | `60` | Alias; falls back to catalog TTL |
| `SHOP_RESOLVE_CACHE_TTL_SEC` | `300` | Domain/slug → shopId, shop meta |
| `SHOP_SERVICE_AREA_CACHE_TTL_SEC` | `180` | Shop delivery hub row |
| `STOREFRONT_CATALOG_HTTP_CACHE_SEC` | `0` | `Cache-Control` on catalog GETs |
| `CATALOG_CACHE_INVALIDATE_TOKEN` | — | Header `X-Catalog-Cache-Invalidate` |
| `STOREFRONT_PRODUCT_LIST_CACHE_MAX_LIMIT` | `50` | Skip Redis for product lists with `limit` above this |
| `STOREFRONT_PRODUCT_LIST_CACHE_MAX_OFFSET` | `100` | Skip Redis when `offset` exceeds this |
| `STOREFRONT_PRODUCT_SEARCH_CACHE_MIN_CHARS` | `3` | Skip Redis for searches shorter than this (trimmed) |

## API inventory

Paths are mounted at `/storefront` and `/api/storefront` unless noted.

| API | Auth | Cache | Notes |
|-----|------|-------|-------|
| `GET /health`, `/health/ready` | No | No | |
| `GET /metrics` | Token | No | `no-store` |
| `GET /api/shops/resolve-by-domain` | No | Redis `resolve:host:*` | |
| `shopResolver` middleware | No | Redis `resolve:slug:*`, `resolve:host:*` | |
| `GET .../categories` | Shop | Redis SWR | Catalog |
| `GET .../categories/:slug` | Shop | Redis SWR | |
| `GET .../products` | Shop | Redis SWR + listing promos | Policy skips high-cardinality list shapes (see below) |
| `GET .../products/:slug`, `/id/:id` | Shop | Redis SWR + cached promo enrich | |
| `POST .../catalog/cache/invalidate` | Token | Bumps `catalogGen` | Optional body `{ prewarm: true, topCategoryLimit }` |
| `POST .../catalog/cache/prewarm` | Token | Warms categories + product lists | Best-effort `200` with step counts |
| `POST .../location/check` | No | Shop hub only | User lat/lng not cached |
| `GET .../coupons` | JWT | Cached coupon defs + **live** redemption counts | Totals/per-customer limits read from DB |
| `GET .../cart` | JWT | Promo queries only | Response not cached |
| Cart mutations, checkout | JWT | No | |
| Orders, profile, auth | JWT | No | |
| Access JWT `jti` | JWT | Redis | Revocation |
| Rate limits | — | Redis counters | Not response cache |

## Key patterns

| Pattern | Example |
|---------|---------|
| Catalog generation | `shop:{shopId}:catalogGen` |
| Versioned prefix | `shop:{shopId}:g{N}:` |
| Promotion settings | `...g{N}:promo:settings` |
| Bundle rules (shop) | `...g{N}:promo:bundles` |
| Product overlays | `...g{N}:promo:overlays:{hash}` |
| Product detail promos | `...g{N}:promo:detail:{productId}` |
| Coupon catalog | `...g{N}:promo:couponCatalog:v2:{code}:{limit}` |
| Resolve slug | `resolve:slug:{slug}` |
| Resolve host | `resolve:host:{host}` |
| Shop meta | `shop:{shopId}:meta:active` |
| Service hub | `shop:{shopId}:serviceHub` |

## Product list cache policy

`GET .../products` still runs the DB query when Redis is skipped; only the cache layer is bypassed.

Skipped shapes (conservative defaults):

- `limit` above `STOREFRONT_PRODUCT_LIST_CACHE_MAX_LIMIT` (default 50)
- `offset` above `STOREFRONT_PRODUCT_LIST_CACHE_MAX_OFFSET` (default 100)
- Cursor pagination (not first page)
- Search shorter than `STOREFRONT_PRODUCT_SEARCH_CACHE_MIN_CHARS` (default 3)
- Both `minPriceMinor` and `maxPriceMinor` set
- `brandId` + search + `categoryId` together

## Cache pre-warm

After deploy or invalidate, warm busy shops so the first customer does not pay cold-cache DB cost:

```http
POST /storefront/catalog/cache/prewarm
X-Catalog-Cache-Invalidate: <CATALOG_CACHE_INVALIDATE_TOKEN>
Content-Type: application/json

{ "shopId": "<uuid>", "topCategoryLimit": 5 }
```

Invalidate with optional pre-warm:

```json
{ "shopId": "<uuid>", "prewarm": true, "topCategoryLimit": 5 }
```

Pre-warm only touches public catalog reads (categories + default/top-category product lists). It does not warm cart, checkout, orders, coupons, or profile.

## Coupon redemption freshness

Cached coupon rows are definitions only (`listEligibleCouponDefinitions`). Before exhaustion checks, `listApplicableCoupons` loads live `total_redemptions` and `customer_redemptions` via `getCouponRedemptionCounts`.

## Limitations and edges

- **TTL and SWR** — Catalog and promotion reads can lag the database until the TTL elapses or you call catalog invalidate (optionally with prewarm). SWR may return a slightly stale value while a background refresh runs. Promo settings (for example `promotions_paused`) follow the same TTL unless you invalidate.

- **Product list policy** — Shapes that skip Redis always hit PostgreSQL. That is intentional (fewer hot keys); it is not a consistency bug.

- **Coupon exhaustion race** — Redemption counts are read live, but two concurrent checkouts can both pass a limit check before either writes `promotion_redemptions`. Stronger guarantees need database constraints or transactional locking, not cache changes alone.

- **Invalidate scope** — `POST .../catalog/cache/invalidate` bumps `catalogGen` (versioned catalog + promo keys under that prefix) and also clears shop resolve/meta for that shop. Expect a short burst of DB load on the next resolves after invalidate.

- **Checkout idempotency** — Replaying checkout with the same `Idempotency-Key` returns the existing order and does not insert promotion redemptions again.

## Memory (Valkey ~900 MB)

Typical use: tens to low hundreds of MB for 10–30 shops at 60s TTL. Set `maxmemory-policy=allkeys-lru`. Monitor `used_memory`.

## Metrics

Prometheus counters: `cache_{layer}_{operation}_total` where `layer` is `catalog`, `promo`, `resolve`, or `meta`.

## Auth fallback

Access JWTs are normally allowlisted in Redis as `access:jti:{jti}`. If Redis is down or keys were cleared,
`ACCESS_JTI_DB_FALLBACK_ENABLED=true` lets protected APIs continue after validating the user/customer in
PostgreSQL via `isCustomerSessionValid`. This fallback applies only to authenticated API access; it does
not cache cart, checkout, orders, or profile responses.
