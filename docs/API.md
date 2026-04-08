# Storefront HTTP API

Base URL: your API host (local default `http://localhost:4100`). JSON request/response bodies unless noted.

## Recent updates (April 2026)

- Picker/staff HTTP APIs were removed from this server.
- Picker/status WebSocket handling was removed from this server.
- This server keeps storefront/customer APIs and emits only an internal `order.created` notification hook during checkout.
- Cart/profile/account/order controllers and validation files were cleaned for consistency (single purpose header per file, comment cleanup).

## API changes applied (field additions)

This section lists backward-compatible response field additions applied from the API field applicability analysis.

### `GET /storefront/products`
- Added response field:
  - `offer_price_minor_per_unit` (string or null, as stored in DB minor units).

### `GET /storefront/products/:slug`
- Added response field:
  - `offer_price_minor_per_unit` (string or null, as stored in DB minor units).

### `GET /storefront/orders`
- Added response fields per order:
  - `picker_id` (uuid or null),
  - `picker_name` (string or null).

### `GET /storefront/orders/:id`
- Added response fields under `order`:
  - `picker_id` (uuid or null),
  - `picker_name` (string or null).

Compatibility note:
- These are additive response fields only. Existing clients continue to work without changes.

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
| POST | `/api/auth/login` | `{ email, password, shopId? }` | **200** — `accessToken`, `shopIds`, `profile`, …. Optional `shopId` selects which tenant to merge a guest cart from cookie `cart_session_id` into (defaults to the sole shop when `shopIds.length === 1`). |

Rate-limited together with OAuth/JWT routes (see server config).

### Auth path aliases (Better Auth–style, same handlers)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/email/register` | Same as `/api/auth/register` |
| POST | `/auth/email/login` | Same as `/api/auth/login` |
| POST | `/auth/logout` | **204** — clears `cart_session_id`, OAuth exchange, and serviceability cookies |
| GET | `/auth/google` | **302** to `/api/oauth/dev/google-start` (pass through query string) |

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

- **Dev only:** if `ALLOW_EMAIL_ONLY_JWT_EXCHANGE=true` (never in production), body `{ "email" }` may mint a JWT without the cookie. In **`NODE_ENV=test`** this flag is forced **off** so automated tests stay secure.
- Optional body `shopId` (as on login) guides guest-cart merge after exchange.

## Profile (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me/profile` | `{ customer: { id, displayName }, address \| null }` |
| PATCH | `/api/me/profile` | Partial update: `displayName?`, `address?` (nested partial; `address` must not be `{}`) |

## Storefront (public + customer)

Resolve the shop with **`shopId` / `shop_id` query**, **`x-shop-id` header**, storefront host / `STOREFRONT_ROOT_DOMAIN` subdomain, or **`shops.custom_domain`** matching `Host` (skipped for `localhost`, `127.*`, and bare IPs so local API clients do not require DB on every request).

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/storefront/location/check` | — | `{ lat, lng }` → `{ serviceable, distanceM?, maxRadiusM? }`; sets httpOnly `storefront_serviceability` cookie |
| GET | `/storefront/categories` | — | Categories + category image when available |
| GET | `/storefront/products` | — | Filters + cursor search |
| GET | `/storefront/products/:slug` | — | Detail (no `description` field — not in DB) |
| POST | `/storefront/cart` | optional Bearer | Create/ensure cart; guest uses `cart_session_id` cookie |
| GET | `/storefront/cart` | optional Bearer | Cart + items + `summary` (`total_price_minor`, `total_offer_price_minor`, `total_discount_minor`, `currency`); Bearer uses customer cart, otherwise guest `cart_session_id` cookie |
| POST | `/storefront/cart/items` | optional Bearer | `{ productId, quantity }`; when same product already exists in the cart, API increments quantity instead of creating a duplicate line |
| PATCH | `/storefront/cart/items/:itemId` | optional Bearer | `{ quantity }` |
| DELETE | `/storefront/cart/items/:itemId` | optional Bearer | |
| POST | `/storefront/checkout` | **Bearer** | `{ notes? }`; transactional order + `order.created` outbox + clears cart; optional `STOREFRONT_ENFORCE_SERVICEABILITY`; triggers internal new-order notification hook by `shopId` |
| POST | `/storefront/profile` | **Bearer** | `{ displayName?, phone? }` (at least one) — `users.phone` + `customers.display_name` |
| GET | `/storefront/address` | **Bearer** | Current linked address |
| POST / PATCH | `/storefront/address` | **Bearer** | Create/patch delivery address (`addresses` + `customers.address_id`) |
| GET | `/storefront/orders` | **Bearer** | Customer orders for tenant |
| GET | `/storefront/orders/:id` | **Bearer** | Order + line items |

**Picker / staff note**

Picker APIs are handled by a separate server.  
This server does not expose `/shop/*` picker endpoints and does not host picker WebSocket channels.

On checkout, this server emits an internal new-order signal (by `shopId`) so another process/service can notify pickers.

Env: `STOREFRONT_DELIVERY_FEE_MINOR` (minor units), optional `REDIS_URL` (catalog cache), `STOREFRONT_ENFORCE_SERVICEABILITY` (boolean).

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
