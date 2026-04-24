# Cache (Redis/Valkey) Engineering Documentation

This document explains how cache is implemented in this project, how API flows connect using `REDIS_URL` (Redis/Valkey), and what fallback behavior exists when cache is unavailable.

## Purpose

Cache is used for four core capabilities:

1. Shared rate limiting across API instances.
2. Storefront catalog response caching.
3. Customer JWT session validity caching.
4. Readiness dependency checks.

## Core Componentss

- `src/infra/redis/sharedRedis.js`
  - Builds one shared `ioredis` client from `REDIS_URL` (works with Redis and AWS Valkey).
  - Used by rate limiter store, catalog cache, and session cache.
  - Closed on graceful shutdown via `disconnectSharedRedis()`.

- `src/interface/http/middleware/createLimiter.js`
  - Creates `express-rate-limit` middleware.
  - Uses `rate-limit-redis` store when cache is configured.
  - Falls back to in-memory counters when Redis is not configured.
  - Can be bypassed for local perf tests with `DISABLE_RATE_LIMITING=true`.

- `src/infra/cache/catalogCache.js`
  - Wraps Redis get/set with safe fallback behavior.
  - Uses cache-aside pattern with lock key (`lock:<cache-key>`) to reduce stampedes.
  - Supports shop-wide cache invalidation by key pattern scan.

- `src/utils/sessionCache.js` + `src/interface/http/middleware/requireCustomerJwt.js`
  - Stores and validates short-lived session validity keys in cache:
    - `session:<userId>:<hashedToken>`
  - On cache miss, middleware checks DB session validity and writes back to cache.

- `src/application/services/health/getReadiness.js`
  - Readiness endpoint pings cache when available.
  - Returns dependency status for DB and cache.

## End-to-End Architecture

```mermaid
flowchart TD
    A[Client / Frontend / k6] --> B[Express API Server]

    B --> C[Route Layer + Middleware]
    C --> D[Rate Limiter Middleware]
    C --> E[JWT Auth Middleware]
    C --> F[Storefront Catalog Service]
    C --> G[Health/Readiness Service]

    D -->|uses RedisStore when REDIS_URL exists| R[(CacheRedisOrValkey)]
    D -->|fallback if no cache| M1[In-memory limiter]

    E -->|session cache check userId:sessionId| R
    E -->|cache miss -> check| P[(PostgreSQL)]
    E -->|cache write valid/invalid| R

    F -->|catalog cache get/set/wrap| R
    F -->|cache miss -> read| P
    F -->|cache invalidate by shop pattern| R

    G -->|readiness ping| R
    B -->|graceful shutdown| H[disconnectSharedRedis()]
    H --> R
```

## API Workflow with Redis

```mermaid
flowchart LR
    U[API Request] --> X{Which endpoint type?}

    X --> RL[Rate-limited endpoints]
    X --> CAT[Catalog endpoints]
    X --> AUTH[JWT protected endpoints]
    X --> READY[/health/ready]

    RL --> R1[createLimiter()]
    R1 -->|if DISABLE_RATE_LIMITING=true| PASS1[skip limiter]
    R1 -->|if REDIS_URL set| REDIS_RL[(Cache counters)]
    R1 -->|if no REDIS_URL| MEM_RL[in-memory counters]
    REDIS_RL --> RES429[429 if over limit]

    CAT --> C1[storefrontCatalog service]
    C1 --> C2{Redis cache hit?}
    C2 -->|Yes| C3[Return cached response]
    C2 -->|No| C4[Query Postgres]
    C4 --> C5[Store in Redis with TTL]
    C5 --> C6[Return response]

    AUTH --> A1[requireCustomerJwt]
    A1 --> A2{Bearer token present?}
    A2 -->|No| UNAUTH[401 unauthorized]
    A2 -->|Yes| A3[Verify JWT + hash token]
    A3 --> A4{Session valid in Redis cache?}
    A4 -->|Yes| OK1[Allow request]
    A4 -->|No/unknown| A5[Check Postgres session]
    A5 --> A6[Write result to cache]
    A6 --> OK1

    READY --> H1[getReadiness]
    H1 --> H2[DB check]
    H2 --> H3[Cache ping if configured]
```

## Cache-Connected API Surface

### Rate-Limited Routes

Applied through shared limiter middleware:

- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `POST /api/auth/oauth/jwt`
- `POST /storefront/location/check`
- `POST /storefront/checkout`
- cart/profile/address mutation routes

### Catalog Cache Routes

- `GET /storefront/categories`
- `GET /storefront/products`
- `GET /storefront/products/:slug`
- `POST /storefront/catalog/cache/invalidate`

### Session Cache in Auth Middleware

JWT-protected storefront routes use cache-backed session validity caching:

- cart routes
- checkout route
- address/profile routes
- orders routes

### Readiness

- `GET /health/ready` pings cache (if configured) and reports dependency status.

## Configuration

### Required for cache usage

- `REDIS_URL=<redis-or-valkey-connection-string>`
- For AWS Valkey in production, use a `rediss://` endpoint.

When `REDIS_URL` is empty:

- rate limiting falls back to in-memory state,
- catalog cache becomes no-op (direct DB reads),
- session cache short-circuit behavior is reduced,
- readiness reports cache as skipped.

### Performance testing switch

- `DISABLE_RATE_LIMITING=true`
  - Temporarily bypasses all limiter middleware (recommended only for controlled perf tests).
  - Must remain false in production.

## Failure and Fallback Strategy

- Cache errors are handled as non-fatal where possible.
- Catalog cache degrades gracefully to DB reads.
- Session cache misses fallback to DB session validity checks.
- Rate limiting can continue in-memory without cache.
- Readiness endpoint fails only when dependency probes fail.

## Operational Notes

- On shutdown, cache client is closed through `disconnectSharedRedis()` in bootstrap.
- In production, if `REDIS_URL` is missing, the app logs a warning to highlight reduced resilience and non-shared limiter state.
- Cache invalidation endpoint requires `CATALOG_CACHE_INVALIDATE_TOKEN`.
