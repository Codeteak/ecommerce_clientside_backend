# Client-side ecommerce API (clean architecture)

Express API with **domain → application → adapters → interface** layering. The composition root is `src/main/composition.js`.

**API reference:** [docs/API_FRONTEND.md](docs/API_FRONTEND.md) · Swagger UI: `/api-docs/` (when `ENABLE_API_DOCS=true`) · **Production deploy:** [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)

The database schema is **`migrations/001_full_schema.sql`** only (`npm run db:migrate` applies that file explicitly). To drop legacy tables not in that schema (after a backup), extend **`scripts/prune-noncanonical-tables.sql`** and run **`npm run db:prune`**. Tenant-scoped reads use Postgres **RLS** via `set_config('app.current_shop_id', …)` before querying.

## Layout

| Layer | Role |
|--------|------|
| `domain/` | Domain errors (`AppError`, `NotFoundError`, `ValidationError`, `AuthError`, `ConflictError`) |
| `application/ports/` | Repository interfaces (contracts) |
| `application/services/` | Application services (catalog, auth, profile, shops, health) |
| `adapters/` | Postgres repositories |
| `infra/db/` | Connection pool, transactions (`withTx` / `withClient`), tenant session helper |
| `infra/security` | JWT (customer tokens), OTP hashing |
| `interface/http/` | Express routes, controllers, validation middleware |
| `main/` | `bootstrap.js` entry, `server.js`, `composition.js` (wiring) |

## Environment

Create a **`.env`** file in the project root (it is gitignored). The app reads configuration from the environment only.

**Development:** many keys have safe defaults if omitted (see `src/config/env.js`). **Production:** set real values; `DATABASE_URL` and a strong `JWT_SECRET` (min 16 characters) are required.

Example `.env` (adjust values; do not commit secrets):

```env
NODE_ENV=development
PORT=4100

CORS_ORIGIN=http://localhost:5173
API_PUBLIC_URL=http://localhost:4100

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL_REJECT_UNAUTHORIZED=false

JWT_SECRET=change_me_min_16_chars
JWT_ISSUER=clientside-ecommerce
JWT_AUDIENCE=clientside-ecommerce
JWT_EXPIRES_IN=8h

SERVICE_AREA_RADIUS_METERS=5000

# Optional: turn off Redis read caches (catalog, resolve-by-domain, promos); rate limits still use Redis
# CACHE_ON=false
```

Full cache reference: [docs/CACHING.md](docs/CACHING.md).

## Run locally

```bash
npm install
# create .env (see above)
npm run db:migrate
npm run dev
```

Default port: **4100**. Ensure a **shop** row exists before customer registration with `shopId`.

**Resolve-by-domain sample** (shop `marketfresh.in` + logo):

```bash
npm run db:seed:resolve-domain
curl -s "http://localhost:4100/api/shops/resolve-by-domain?domain=marketfresh.in" | jq
```

Requires `OBJECT_STORAGE_PUBLIC_BASE_URL` in `.env` for a non-null `shop_image` URL. SQL: [scripts/ops/seed-resolve-by-domain-sample.sql](scripts/ops/seed-resolve-by-domain-sample.sql).

**Production:** Deploy the latest API (response is `shop_id`, `shop_name`, `shop_image` only — not legacy `{ shopId }`). Run the seed SQL on the production DB for `marketfresh.in`, set `OBJECT_STORAGE_PUBLIC_BASE_URL`, and ensure the logo file exists at the `storage_key` path in object storage.

## API docs (Swagger UI)

When `ENABLE_API_DOCS=true` (default in development):

- **Swagger UI:** [http://localhost:4100/api-docs/](http://localhost:4100/api-docs/)
- **OpenAPI JSON:** [http://localhost:4100/openapi.json](http://localhost:4100/openapi.json)

In **production**, docs are off unless both `ENABLE_API_DOCS=true` and `ALLOW_API_DOCS_IN_PRODUCTION=true` are set. CodeDeploy `application_start` strips those keys from Secrets Manager and appends `ENABLE_API_DOCS=false` so the API starts safely (outbox polling runs inside the same process by default).

## Postman

1. Import [postman/ClientSide-Ecommerce-API.postman_collection.json](postman/ClientSide-Ecommerce-API.postman_collection.json).
2. Optional: [postman/Local.postman_environment.json](postman/Local.postman_environment.json) — environment **ClientSide Ecommerce — Local**.
3. Set `shopId` and `phone` to match your database/test data.
4. Run **Health**, then **Auth**; successful auth saves `accessToken` for protected requests.

## Tests

HTTP tests use [Vitest](https://vitest.dev/) and [Supertest](https://github.com/ladjs/supertest) (`createServer()` only). Most tests do **not** require PostgreSQL.

```bash
npm test
npm run test:watch
```

Integration tests (Postgres + Redis required, not run in CI):

```bash
export INTEGRATION_DATABASE_URL=...
export INTEGRATION_REDIS_URL=...
RUN_INTEGRATION_TESTS=1 npm run test:integration:ci
```
