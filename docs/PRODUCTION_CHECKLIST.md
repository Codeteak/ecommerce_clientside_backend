# Production deployment checklist

Use this list before routing production traffic to a new API or outbox-worker deployment.

## Required environment

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | Must be `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Required for shared rate limits, catalog SWR cache, and optional session cache |
| `JWT_SECRET` | Strong secret (min 16 chars); not the dev default |
| `JWT_REFRESH_SECRET` | Strong secret; not the dev default |
| `METRICS_SCRAPE_TOKEN` | Protects `GET /metrics` (Bearer or `X-Metrics-Token`) |
| `MSG_AUTH_KEY` | MSG91 Flow SMS for phone OTP |
| `TRUST_PROXY` | `true` behind ALB/nginx so `req.ip` and rate limits are correct |
| `SERVICEABILITY_COOKIE_SECRET` | Min 16 chars; must differ from `JWT_SECRET` when delivery zones are enforced |

## Strongly recommended

| Variable | Notes |
|----------|--------|
| `JWT_ACCESS_EXPIRES_IN` | At most `60m` in production (e.g. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `30d` |
| `STOREFRONT_ENFORCE_SERVICEABILITY` | `true` when checkout must respect delivery zones |
| `CUSTOMER_SESSION_CHECK_CACHE_MS` | `0` or short TTL if immediate revoke matters |
| `ACCESS_JTI_REDIS_REQUIRED` | Defaults to on in production; access JWTs require Redis jti allowlist |
| `REALTIME_ENABLED` | `true` when picker apps use Socket.IO (`/socket.io`) |
| `SEARCH_USE_TRGM` | `true` after staging `EXPLAIN` confirms GIN trgm index use |
| `SENTRY_DSN` | Optional centralized error reporting |

## Forbidden or restricted in production

| Variable | Rule |
|----------|------|
| `DISABLE_CUSTOMER_AUTH` | Must be `false` (startup fails if `true`) |
| `LOG_OTP_IN_DEV` | Must be `false` |
| `DISABLE_RATE_LIMITING` | Must be `false` |
| `ENABLE_API_DOCS` | Blocked unless `ALLOW_API_DOCS_IN_PRODUCTION=true` |
| Dev headers `x-dev-user-id` / `x-dev-customer-id` | Only when auth bypass is enabled (never in prod) |

## Multi-instance layout

- Run **two or more API tasks** behind a load balancer.
- Run **at least one outbox worker** (`npm run start:outbox` or separate ECS service) so `outbox_messages` drain.
- All API replicas must share the same `REDIS_URL` and `DATABASE_URL`.
- Scrape **`GET /metrics`** from each task (Prometheus text) with the metrics token.

## Deploy validation

1. **`GET /health`** — process up (liveness).
2. **`GET /health/ready`** — PostgreSQL and Redis reachable (readiness). CodeDeploy/ECS should use this, not only `/health`.
3. **`GET /metrics`** — returns Prometheus text when token is set.
4. Smoke: OTP request (or known test shop), cart GET, checkout on staging.

## Graceful shutdown

- `SHUTDOWN_TIMEOUT_MS` (default 30000): max wait for in-flight HTTP requests on SIGTERM before force-close.
- ECS/CodeDeploy stop timeout should be **≥ shutdown timeout + 5s** so drains complete.

## Database

After schema or index migrations, verify hot queries use indexes. See [PHASE4_EXPLAIN_VERIFY.md](./PHASE4_EXPLAIN_VERIFY.md).

Before adding API or outbox replicas, size connection pools using [DB_CONNECTION_SCALING.md](./DB_CONNECTION_SCALING.md).

## Metrics and logs

- **Metrics:** Prometheus scrape `https://<host>/metrics` with `Authorization: Bearer <METRICS_SCRAPE_TOKEN>`. CloudWatch: use ADOT/Prometheus sidecar or agent—no in-app CloudWatch SDK required.
- **Logs:** JSON logs include `requestId` (also `x-request-id` response header). Correlate HTTP access logs with `api.checkout.*` / `api.request.*` events via `requestId`.

## Token policy summary

| Token | Typical TTL | Purpose |
|-------|-------------|---------|
| Access JWT | ≤ 60m (`JWT_ACCESS_EXPIRES_IN`) | API authorization; includes `jti` checked in Redis |
| Refresh token | `JWT_REFRESH_EXPIRES_IN` | Rotate access without re-OTP |

`POST /api/auth/logout` revokes the current access `jti` and all refresh tokens for the user.

## Realtime (picker)

When `REALTIME_ENABLED=true`:

- ALB must allow WebSocket upgrade to `/socket.io` (idle timeout ≥ client ping interval).
- Picker clients authenticate with a **staff JWT** (`role`: `picker`, `owner`, `admin`, or `manager`) and `shopId` in the handshake (`auth.shopId`, `auth.token`), using the same `JWT_SECRET` / issuer as this API.
- Staging-only: `REALTIME_CONNECT_TOKEN` + `shopId` (do not use in production).
- Outbox worker must run so `ORDER_PLACED_REALTIME` retries emit across instances.

## Search at scale

- Enable `SEARCH_USE_TRGM=true` only after verifying GIN index use in [PHASE4_EXPLAIN_VERIFY.md](./PHASE4_EXPLAIN_VERIFY.md).
- OpenSearch is deferred; see [SEARCH_OPENSEARCH.md](./SEARCH_OPENSEARCH.md) for adoption criteria.

## Integration tests (CI / local)

```bash
docker compose -f docker-compose.test.yml up -d
bash scripts/wait-for-test-services.sh
export DATABASE_URL=postgresql://postgres:test@127.0.0.1:5433/ecommerce_test
export INTEGRATION_DATABASE_URL=$DATABASE_URL
export INTEGRATION_REDIS_URL=redis://127.0.0.1:6380
npm run db:migrate
RUN_INTEGRATION_TESTS=1 npm run test:integration:ci
```

## Sign-off

- [ ] Env vars reviewed against this checklist
- [ ] `/health/ready` green on all new tasks
- [ ] Outbox worker running and `outbox` metrics show processing
- [ ] Metrics scrape configured (token not exposed publicly)
- [ ] No debug/agent `fetch` to localhost in deployed image
