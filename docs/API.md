# Storefront HTTP API

Base URL: your API host (local default `http://localhost:4100`). JSON request/response bodies unless noted.

## Authentication

- **Bearer JWT:** `Authorization: Bearer <accessToken>` for protected routes.
- **Claims:** `role`, `customerId`; `shopId` may be present when the customer has exactly one active shop (e.g. after register). Login responses include `shopIds`; use one of them for tenant-scoped catalog calls.

## Errors

Most failures return JSON:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human-readable detail"
  }
}
```

Common codes: `VALIDATION_ERROR`, `AUTH_ERROR`, `NOT_FOUND`, `CONFLICT`, `ROUTE_NOT_FOUND`, `INVALID_JSON`, `TOO_MANY_REQUESTS`, `SERVICE_UNAVAILABLE`.

## Health & root

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service stub with pointers to health / OAuth success |
| GET | `/health` | Liveness: `status`, `service` |

## Customer auth (email + password)

| Method | Path | Body | Notes |
|--------|------|------|--------|
| POST | `/api/auth/register` | `{ shopId, email, password, displayName? }` | **201** — `accessToken`, `user`, `shop`, `customer`, `profile`, … |
| POST | `/api/auth/login` | `{ email, password }` | **200** — `accessToken`, `shopIds`, `profile`, … |

Rate-limited together with OAuth/JWT routes (see server config).

## Google OAuth2

Google Cloud Console **redirect URI:** `{API_PUBLIC_URL}/api/oauth/callback/google` (no trailing slash on `API_PUBLIC_URL`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/oauth/ok` | Sanity check `{ ok: true }` |
| GET | `/api/oauth/success` | Landing after callback; JSON hint to call JWT exchange |
| GET | `/api/oauth/sign-in/social` | **405** — use POST |
| POST | `/api/oauth/sign-in/social` | Start flow — body below |
| GET | `/api/oauth/dev/google-start` | Dev helper; query: `shopId?`, `callbackURL?` → redirect to Google |
| GET | `/api/oauth/callback/google` | OAuth redirect target (browser); sets `storefront_oauth_exchange` cookie |

**POST `/api/oauth/sign-in/social`** body:

```json
{
  "provider": "google",
  "disableRedirect": true,
  "callbackURL": "https://your-frontend/oauth-return",
  "additionalData": { "shopId": "optional-shop-uuid" }
}
```

- Without `disableRedirect`, response is **302** to Google.
- With `disableRedirect: true`, **200** `{ "url": "https://accounts.google.com/..." }`.

**Complete sign-in:** after callback, **POST `/api/auth/oauth/jwt`** from the **same origin** as the API with cookies: `fetch(..., { credentials: 'include' })`, body `{}` preferred.

- **Dev only:** if `ALLOW_EMAIL_ONLY_JWT_EXCHANGE=true` (never in production), body `{ "email" }` may mint a JWT without the cookie.

## Profile (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me/profile` | `{ customer: { id, displayName }, address \| null }` |
| PATCH | `/api/me/profile` | Partial update: `displayName?`, `address?` (nested partial; `address` must not be `{}`) |

## Service area (public)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/shops/:shopId/service-area/check` | `{ lat, lng }` — response includes `inServiceArea`, `distanceM`, `maxRadiusM` (`SERVICE_AREA_RADIUS_METERS`, default 5000). |

## Catalog (tenant-scoped)

Provide **`shopId`** query parameter or **`x-shop-id`** header on all catalog routes.

| Method | Path | Query / notes |
|--------|------|----------------|
| GET | `/api/catalog/categories` | `parentId?` |
| GET | `/api/catalog/products` | `categoryId?` |
| GET | `/api/catalog/items` | Same as products (active items) |
| GET | `/api/catalog/search` | See below |

### GET `/api/catalog/search`

| Query | Default / notes |
|-------|-----------------|
| `shopId` | Required (or header `x-shop-id`) |
| `type` | `both` — `products` \| `categories` \| `both` |
| `q` | Search string (optional) |
| `categoryId` | Filter products (optional UUID) |
| `parentId` | Filter categories (optional UUID) |
| `availability` | `in_stock` \| `out_of_stock` \| `unknown` (products) |
| `productSort` | `name` \| `price` \| `created_at` \| `availability` |
| `productOrder` | `asc` \| `desc` |
| `categorySort` | `sort_order` \| `name` \| `created_at` |
| `categoryOrder` | `asc` \| `desc` |
| `productLimit` | 1–100, default 100 |
| `productOffset` | default 0 |
| `categoryLimit` | 1–500, default 500 |
| `categoryOffset` | default 0 |

Response shape: `{ products: [...], categories: [...] }` (arrays omitted empty side when `type` filters one kind).

## Postman

Import [postman/ClientSide-Ecommerce-API.postman_collection.json](../postman/ClientSide-Ecommerce-API.postman_collection.json).
