# Client-side ecommerce API (clean architecture)

Express API with **domain → application → adapters → interface** layering. The composition root is `src/main/composition.js`.

## Layout

| Layer | Role |
|--------|------|
| `domain/` | Entities and domain errors (`AppError`, `NotFoundError`) |
| `application/ports/` | Repository interfaces (contracts) |
| `application/usecases/` | Application services (one function per use case) |
| `adapters/` | Infrastructure implementations (e.g. in-memory or Postgres repos) |
| `interface/http/` | Express routes, controllers, middleware |
| `main/` | `bootstrap.js` entry, `server.js`, `composition.js` (wiring) |

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

- `GET /health` — liveness
- `GET /api/catalog/items` — demo list (in-memory adapter)

Default port: **4100** (see `.env.example`).
