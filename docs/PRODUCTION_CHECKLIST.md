# Production Checklist

Use this checklist before sending real customer traffic to a new API deployment.

## 1. Required Env Vars

These values must be set before production starts.

| Env var | What it is for | Rule |
|---------|----------------|------|
| `NODE_ENV` | App mode | Must be `production` |
| `DATABASE_URL` | PostgreSQL connection | Must point to the production database |
| `REDIS_URL` | Redis / Valkey connection | Required for shared rate limits, cache, and token checks |
| `JWT_SECRET` | Signs access tokens | Use a strong secret, not the dev value |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | Use a strong secret, not the dev value |
| `METRICS_SCRAPE_TOKEN` | Protects `GET /metrics` | Keep it private |
| `MSG_AUTH_KEY` | Sends phone OTP by MSG91 | Must be valid |
| `TRUST_PROXY` | Reads real client IP behind ALB/nginx | Set to `true` behind a proxy |
| `SERVICEABILITY_COOKIE_SECRET` | Signs serviceability cookies | Minimum 16 chars; do not reuse `JWT_SECRET` |

## 2. Recommended Env Vars

These values are not always required, but they should be reviewed.

| Env var | Recommended value | Why |
|---------|-------------------|-----|
| `JWT_ACCESS_EXPIRES_IN` | `15m` to `60m` | Short access tokens reduce risk |
| `JWT_REFRESH_EXPIRES_IN` | Example: `40d` (no spaces; `40 d` is normalized at startup) | Refresh JWT + `auth_refresh_tokens.expires_at` TTL |
| `STOREFRONT_ENFORCE_SERVICEABILITY` | `true` | Blocks checkout outside delivery area |
| `SERVICEABILITY_COOKIE_SAMESITE` | `lax` for same-site, `none` for cross-site frontend/API | Controls browser cookie policy for checkout guard |
| `SERVICEABILITY_COOKIE_SECURE` | `true` when `SERVICEABILITY_COOKIE_SAMESITE=none` | Browsers reject `SameSite=None` without `Secure` |
| `SERVICEABILITY_COOKIE_DOMAIN` | Empty unless sharing across subdomains | Optional cookie scope override (e.g. `.example.com`) |
| `CUSTOMER_SESSION_CHECK_CACHE_MS` | `0` or short TTL | Keeps logout/revoke behavior fresh |
| `ACCESS_JTI_REDIS_REQUIRED` | `true` in production | Requires Redis token allowlist |
| `REALTIME_ENABLED` | `true` only if picker app uses Socket.IO | Enables realtime order events |
| `SEARCH_USE_TRGM` | `true` only after index check | Uses PostgreSQL trigram search |
| `SENTRY_DSN` | Optional | Sends errors to Sentry |

## 3. Never Allow In Production

These settings must stay off in production.

| Setting | Production rule |
|---------|-----------------|
| `DISABLE_CUSTOMER_AUTH` | Must be `false` |
| `LOG_OTP_IN_DEV` | Must be `false` |
| `DISABLE_RATE_LIMITING` | Must be `false` |
| `ENABLE_API_DOCS` | Only allow if `ALLOW_API_DOCS_IN_PRODUCTION=true` |
| Dev headers `x-dev-user-id` / `x-dev-customer-id` | Never use in production |

## 4. App Layout

Use this layout for production:

- Run at least **two API tasks** behind a load balancer (optional for small deployments; one task is fine to start).
- Each API process **polls `outbox_messages` in the background** when `OUTBOX_WORKER_ENABLED=true` (default). No separate outbox container is required.
- Make sure every API task uses the same `DATABASE_URL`.
- Make sure every API task uses the same `REDIS_URL`.
- Scrape `GET /metrics` from each task using `METRICS_SCRAPE_TOKEN`.

Optional standalone outbox process (only if you set `OUTBOX_WORKER_ENABLED=false` on the API):

```bash
npm run start:outbox
```

## 5. Health Checks Before Traffic

Run these checks before routing customers to the new version.

1. `GET /health`
   Confirms the process is running.

2. `GET /health/ready`
   Confirms PostgreSQL and Redis are reachable. ECS or CodeDeploy should use this for readiness.

3. `GET /metrics`
   Confirms metrics are working when the token is provided.

4. Smoke test on staging:
   Request OTP, open cart, and place a test checkout.

## 6. Graceful Shutdown

Production must give the app enough time to finish active requests.

- `SHUTDOWN_TIMEOUT_MS` defaults to `30000`.
- ECS or CodeDeploy stop timeout should be at least `SHUTDOWN_TIMEOUT_MS + 5 seconds`.

## 7. Database Checks

Do these checks after schema or index changes.

- Verify important queries use indexes.
- Use [PHASE4_EXPLAIN_VERIFY.md](./PHASE4_EXPLAIN_VERIFY.md) for query checks.
- Before adding more API or worker tasks, review connection pool size in [DB_CONNECTION_SCALING.md](./DB_CONNECTION_SCALING.md).

## 8. Redis / Valkey Cache

Full cache details are in [CACHING.md](./CACHING.md).

| Env var | Default | What it controls |
|---------|---------|------------------|
| `CACHE_ON` | `true` | `false` disables all Redis **read** caches (catalog, resolve, promos); keeps rate limits and JWT `jti` |
| `STOREFRONT_CATALOG_CACHE_TTL_SEC` | `60` | Catalog cache TTL |
| `STOREFRONT_PROMO_CACHE_TTL_SEC` | `0` | Promo cache TTL; `0` uses catalog TTL |
| `SHOP_RESOLVE_CACHE_TTL_SEC` | `300` | Domain/slug to shop cache |
| `SHOP_SERVICE_AREA_CACHE_TTL_SEC` | `180` | Delivery hub cache |
| `CATALOG_CACHE_INVALIDATE_TOKEN` | Empty | Protects cache invalidate and prewarm endpoints |
| `STOREFRONT_PRODUCT_LIST_CACHE_MAX_LIMIT` | `50` | Product list cache limit |
| `STOREFRONT_PRODUCT_LIST_CACHE_MAX_OFFSET` | `100` | Product list offset cache limit |
| `STOREFRONT_PRODUCT_SEARCH_CACHE_MIN_CHARS` | `3` | Minimum search length to cache |

Cache rules:

- Set Valkey `maxmemory-policy=allkeys-lru`.
- Around 900 MB is usually enough for 10-30 shops with 60 second TTLs. Still monitor `used_memory`.
- Invalidate cache after catalog, promotion, or shop domain changes.
- For debugging stale shop name/logo on resolve-by-domain, set `CACHE_ON=false` or `SHOP_RESOLVE_CACHE_TTL_SEC=0` temporarily (see [CACHING.md](./CACHING.md)).
- For busy shops, prewarm cache after deploy or cache flush.
- Watch Prometheus counters like `cache_catalog_*`, `cache_promo_*`, `cache_resolve_*`, and `cache_meta_*`.
- Cart and checkout JSON responses are not cached.

Useful cache endpoints:

```http
POST /storefront/catalog/cache/invalidate
POST /storefront/catalog/cache/prewarm
```

Both endpoints require:

```http
X-Catalog-Cache-Invalidate: <CATALOG_CACHE_INVALIDATE_TOKEN>
```

## 9. Metrics And Logs

Metrics:

- Scrape `https://<host>/metrics`.
- Send `Authorization: Bearer <METRICS_SCRAPE_TOKEN>` or `X-Metrics-Token`.
- CloudWatch can read these metrics through an ADOT or Prometheus agent.

Logs:

- Logs are JSON.
- Each request has a `requestId`.
- The response also includes `x-request-id`.
- Use `requestId` to connect HTTP logs with events like `api.checkout.*` and `api.request.*`.

## 10. Tokens And Logout

Token rules:

| Token | Recommended TTL | Notes |
|-------|-----------------|-------|
| Access JWT | 15m to 60m | Checked with Redis `jti` allowlist |
| Refresh token | Example: `30d` | Used to get a new access token |

Logout behavior:

- `POST /api/auth/logout` revokes the current access `jti`.
- It also revokes all refresh tokens for that user.

Redis fallback:

- `ACCESS_JTI_DB_FALLBACK_ENABLED=true` lets protected APIs fall back to PostgreSQL if Redis is down or the `jti` key is missing.
- This keeps users online after a cache flush.
- Tradeoff: a manually logged-out access token can work until the short access JWT expires.
- Set `ACCESS_JTI_DB_FALLBACK_ENABLED=false` if you want strict fail-closed behavior.

## 11. Realtime Picker App

Use this only when `REALTIME_ENABLED=true`.

- The load balancer must allow WebSocket upgrade to `/socket.io`.
- The load balancer idle timeout must be higher than the client ping interval.
- Picker clients must use a staff JWT.
- Allowed staff roles: `picker`, `owner`, `admin`, or `manager`.
- The Socket.IO handshake must include `auth.shopId` and `auth.token`.
- Do not use `REALTIME_CONNECT_TOKEN` in production. It is for staging only.
- The API must have `OUTBOX_WORKER_ENABLED=true` (default) so `ORDER_PLACED_REALTIME` retries are processed.

## 12. Search

- Enable `SEARCH_USE_TRGM=true` only after staging confirms the GIN trigram index is used.
- Use [PHASE4_EXPLAIN_VERIFY.md](./PHASE4_EXPLAIN_VERIFY.md) for this check.
- OpenSearch is not required now. See [SEARCH_OPENSEARCH.md](./SEARCH_OPENSEARCH.md) for future adoption rules.

## 13. Integration Tests (optional, local only)

CI runs unit tests only. To run integration tests locally, point at your own Postgres and Redis, migrate, then:

```bash
export INTEGRATION_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
export INTEGRATION_REDIS_URL=redis://HOST:6379
export DATABASE_URL=$INTEGRATION_DATABASE_URL
npm run db:migrate
RUN_INTEGRATION_TESTS=1 npm run test:integration:ci
```

## 14. Final Sign-Off

Before going live, confirm:

- [ ] Required env vars are set.
- [ ] Forbidden production settings are off.
- [ ] `/health/ready` is green on every new API task.
- [ ] API logs show `Outbox poller started (embedded in API)` (or outbox metrics show messages processing).
- [ ] Outbox metrics show messages are processing when orders are placed.
- [ ] Metrics scraping is configured.
- [ ] The metrics token is not public.
- [ ] Redis / Valkey memory is monitored.
- [ ] Cache invalidate and prewarm are ready for busy shops.
- [ ] No debug code calls localhost in the deployed image.
