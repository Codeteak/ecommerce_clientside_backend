# Client-side ecommerce API (clean architecture)

Express API with **domain → application → adapters → interface** layering. The composition root is `src/main/composition.js`.

**API reference:** [docs/API.md](docs/API.md)

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
```

## Run locally

```bash
npm install
# create .env (see above)
npm run db:migrate
npm run dev
```

Default port: **4100**. Ensure a **shop** row exists before customer registration with `shopId`.

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
