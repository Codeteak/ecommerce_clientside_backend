# Codebase audit — todo checklist

Action items derived from the architecture/security/performance review. Check items off as you complete them.

**Stack note:** This API uses Express, `pg` (raw SQL), Zod, JWT, Redis (optional)—not Sequelize or Socket.IO.

---

## P0 — Critical / security blockers

- [ ] **Forbid `DISABLE_CUSTOMER_AUTH` in production** — Add `superRefine` in [`src/config/env/schema.js`](../src/config/env/schema.js) (same pattern as `DISABLE_RATE_LIMITING`). Today [`composition.js`](../src/main/composition.js) can swap JWT for dev headers if the flag is set in prod.

---

## P1 — High priority

- [ ] **Harden Postgres TLS in production** — [`src/infra/db/pool.js`](../src/infra/db/pool.js): use RDS (or provider) CA via `DATABASE_SSL_CA_PEM` and set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` in prod; avoid long-term `rejectUnauthorized: false` without CA.
- [ ] **Multi-instance rate limits** — Wire **`rate-limit-redis`** (already in `package.json`, unused) for `express-rate-limit` in [`createLimiter.js`](../src/interface/http/middleware/createLimiter.js), or remove the dependency if you standardize on another store.
- [ ] **Confirm `REDIS_URL` in production** — [`bootstrap.js`](../src/main/bootstrap.js) warns when unset: per-process limits + no shared catalog cache across replicas.

---

## P2 — Medium priority

- [ ] **Fix `docker-compose` healthcheck** — [`docker-compose.yml`](../docker-compose.yml) uses `wget`; [`Dockerfile`](../Dockerfile) `node:22-alpine` image may not include it. Align with Dockerfile’s `node -e` health check or install `curl`/`wget` in the image.
- [ ] **Resolve empty OAuth modules** — [`src/interface/http/controllers/oauthController.js`](../src/interface/http/controllers/oauthController.js) and [`oauthRoutes.js`](../src/interface/http/routes/oauthRoutes.js) are empty. Either implement routes + controller or delete and update Postman/README so docs match code.
- [ ] **Align CodeBuild Node vs Docker Node** — [`buildspec.yml`](../buildspec.yml) uses Node 20; [`Dockerfile`](../Dockerfile) uses Node 22. Reduce version drift (pick one LTS line for CI and runtime).
- [ ] **Split `CustomerAuthRepoPg`** — Large adapter ([`CustomerAuthRepoPg.js`](../src/adapters/repositories/postgres/CustomerAuthRepoPg.js)): consider smaller repos (OTP, profile, memberships) for maintainability and ISP.
- [ ] **Document session cache scope** — [`requireCustomerJwt`](../src/interface/http/middleware/requireCustomerJwt.js) + [`composition.js`](../src/main/composition.js): DB session check is cached only for specific GETs; document for operators (revocation vs latency tradeoff).

---

## P3 — Lower priority / hygiene

- [ ] **Run `npm audit fix` (dev chain)** — Address Vite/PostCSS advisories in dev dependencies; prod image uses `npm ci --omit=dev` but CI/dev machines still benefit.
- [ ] **Move `pino-pretty` to devDependencies** (if not needed at runtime) — Shrink production `node_modules` in [`package.json`](../package.json).
- [ ] **Remove unused `rate-limit-redis`** — If you choose not to implement Redis store, drop the package to avoid confusion.
- [ ] **Add `process.on('unhandledRejection', …)`** in [`bootstrap.js`](../src/main/bootstrap.js) — Log and optionally exit in production per your crash policy.
- [ ] **HTTP integration tests** — Add coverage for `POST /storefront/checkout`, `GET /storefront/orders` (with test DB or containers); expand beyond current mostly-unit HTTP tests.

---

## Performance & DB (when metrics justify)

- [ ] **Profile storefront product list query** — [`buildListProductsStorefrontQuery.js`](../src/adapters/repositories/postgres/queries/buildListProductsStorefrontQuery.js): monitor p95; consider slimmer list DTO, caching, or read replicas under load.
- [ ] **Verify `ORDER BY` whitelist coverage** — Ensure every caller of `storefrontProductsOrderByClause` / dynamic `orderBySql` passes only schema-validated `sortBy` / `sortOrder` (no user-raw SQL).

---

## API & ops consistency

- [ ] **Document canonical storefront base path** — Routes mount both `/storefront` and `/api/storefront` in [`storefrontRoutes.js`](../src/interface/http/routes/storefrontRoutes.js); state which clients should use.
- [ ] **Wire or document `emitOrderPlaced`** — [`composition.js`](../src/main/composition.js) noop; connect to queue/webhook when pickers/downstream need realtime signals.

---

## Already in good shape (no todo required)

- Clean layering: domain → application → adapters → HTTP; composition root [`composition.js`](../src/main/composition.js).
- Parameterized SQL with `$1…$n`; order list batches items (no N+1 per order) in [`OrderRepoPg`](../src/adapters/repositories/postgres/OrderRepoPg.js).
- Central error handler [`errorHandler.js`](../src/interface/http/middleware/errorHandler.js); structured logging via Pino.
- Production env guards for JWT defaults, `LOG_OTP_IN_DEV`, API docs, `TRUST_PROXY`, `DISABLE_RATE_LIMITING` in [`schema.js`](../src/config/env/schema.js).
- Docker: non-root user, multi-stage build, Node-based healthcheck in [`Dockerfile`](../Dockerfile).

---

## Quick reference — files touched by top fixes

| Todo | Primary file(s) |
|------|------------------|
| Disable auth bypass in prod | `src/config/env/schema.js` |
| DB TLS | `src/config/env/schema.js`, `src/infra/db/pool.js` |
| Redis rate limit | `src/interface/http/middleware/createLimiter.js`, `src/interface/http/routes/index.js` |
| Compose healthcheck | `docker-compose.yml` |
| OAuth dead code | `src/interface/http/controllers/oauthController.js`, `oauthRoutes.js`, Postman/README |
