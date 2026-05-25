# Admin panel — storefront cache invalidation guide

Send this document to the **admin panel / back-office** team. When staff add or change products, categories, prices, promotions, or shop settings in the admin UI, the **customer storefront API** may still serve **cached** catalog data for up to about **60 seconds** unless the cache is cleared.

The admin panel must call the **storefront API cache endpoints** after successful writes to the database.

---

## 1. Why this is required

The storefront API caches read-heavy data in **Redis/Valkey** to keep the mobile/web app fast:

| Cached data | Typical TTL | Affected customer views |
|-------------|-------------|-------------------------|
| Categories & product lists | ~60s (configurable) | Browse, search, home |
| Product detail by slug/id | ~60s | Product page |
| Promotions (bundles, coupons, SKU promos) | Same generation as catalog | Prices, badges, offers |
| Shop domain/slug resolve & shop meta | 3–5 min | Wrong shop / “shop inactive” until cleared |

**Cart, checkout, orders, and customer profile are not cached** — only catalog and promotion **reads**.

Without invalidation, customers can briefly see **old prices, missing products, or outdated promotions** after an admin save.

---

## 2. What the admin panel must do (summary)

After any successful change that affects what customers see in the catalog:

1. Save the change in the admin database (as today).
2. Call **`POST /storefront/catalog/cache/invalidate`** for the affected **`shopId`**.
3. Recommended: send **`"prewarm": true`** so the next customers do not hit a cold cache.
4. Use the shared secret header **`X-Catalog-Cache-Invalidate`** (configured in AWS as `CATALOG_CACHE_INVALIDATE_TOKEN`).

**Do not** expose the token in the browser. Call these endpoints from the **admin backend** (server-to-server), not from the admin SPA in the client.

---

## 3. API endpoints

Base URL: your production storefront API host (same API the customer app uses), e.g. `https://api.example.com`.

Both paths below are also available under the `/api/storefront` prefix (alias).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/storefront/catalog/cache/invalidate` | Clear catalog + promotion cache for one shop |
| `POST` | `/storefront/catalog/cache/prewarm` | Optional: warm cache after invalidate (separate call) |

Endpoints exist only if `CATALOG_CACHE_INVALIDATE_TOKEN` is set on the API. If the token is empty, routes are disabled.

### Authentication

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Catalog-Cache-Invalidate` | `<CATALOG_CACHE_INVALIDATE_TOKEN>` from secrets (ops team provides) |

No customer JWT is required. This is an **internal operations** token.

---

## 4. Invalidate (required after catalog changes)

### Request

```http
POST /storefront/catalog/cache/invalidate
Content-Type: application/json
X-Catalog-Cache-Invalidate: <secret-token>

{
  "shopId": "00000000-0000-4000-8000-000000000001",
  "prewarm": true,
  "topCategoryLimit": 5
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `shopId` | Yes | UUID of the shop whose cache should be cleared |
| `prewarm` | No | If `true`, API invalidates then runs pre-warm in one request (recommended) |
| `topCategoryLimit` | No | When prewarming: how many top-level categories get product-list warm-up (1–20, default 5) |

### Responses

| Status | Meaning |
|--------|---------|
| `204` | Invalidated only (`prewarm` omitted or false) |
| `200` | Invalidated and prewarm finished — JSON body with step results (see below) |
| `403` | Missing or wrong `X-Catalog-Cache-Invalidate` |
| `400` | Invalid body (e.g. bad `shopId` UUID) |
| `429` | Rate limited — retry with backoff |

### Example `200` prewarm body

```json
{
  "shopId": "00000000-0000-4000-8000-000000000001",
  "warmed": 7,
  "failed": 0,
  "topCategoryLimit": 5,
  "categoryIdsWarmed": ["..."],
  "steps": [
    { "step": "categories:all", "ok": true },
    { "step": "categories:root", "ok": true },
    { "step": "products:default", "ok": true },
    { "step": "products:category:<uuid>", "ok": true }
  ]
}
```

Partial failures (`failed` > 0) still mean cache was **invalidated**; some warm steps may have failed — safe to retry prewarm only.

### What gets cleared

For the given `shopId`, the API:

1. **Bumps catalog generation** — all versioned keys under `shop:{shopId}:g{N}:` (products, categories, promotions) stop being used; new reads rebuild from DB.
2. **Clears shop resolve/meta cache** — `shop:{shopId}:meta:active`, `shop:{shopId}:serviceHub`, and related resolve keys for that shop.

Old Redis keys expire on their own via TTL; no manual key deletion is needed.

---

## 5. Prewarm only (optional separate call)

Use when you already invalidated without `prewarm` and want to warm cache again:

```http
POST /storefront/catalog/cache/prewarm
Content-Type: application/json
X-Catalog-Cache-Invalidate: <secret-token>

{
  "shopId": "00000000-0000-4000-8000-000000000001",
  "topCategoryLimit": 5
}
```

Always returns `200` with the step summary JSON.

Prewarm loads: all categories, root categories, default product list, and product lists for top N root categories. It does **not** warm every search/filter combination.

---

## 6. When to call invalidate

Call **`POST .../catalog/cache/invalidate`** (with `prewarm: true` in production) after successful admin saves for:

| Admin action | Invalidate? |
|--------------|-------------|
| Create / update / delete **product** | Yes |
| Change **price**, **availability**, **status**, images | Yes |
| Create / update / delete **category** | Yes |
| Change **promotion**, **coupon**, **bundle** rules | Yes |
| Change shop **name**, **logo**, **active/blocked**, custom **domain** | Yes |
| Change **delivery hub** / service area config | Yes (meta + hub cache cleared) |
| Customer order status, user profile, internal staff settings | No (not catalog cache) |
| Cart-only operations on customer app | No |

**Rule of thumb:** if a change should appear on the **storefront product/category/browse** screens, invalidate for that shop.

---

## 7. Admin backend integration pattern

### Recommended flow (pseudo-code)

```text
onAdminCatalogMutationSuccess(shopId):
  try:
    POST /storefront/catalog/cache/invalidate
      headers: X-Catalog-Cache-Invalidate: env.CATALOG_CACHE_INVALIDATE_TOKEN
      body: { shopId, prewarm: true, topCategoryLimit: 5 }
    log success (optional: log prewarm steps)
  catch error:
    log error — DB save already succeeded
    show admin warning: "Saved, but storefront cache refresh failed. Retry refresh or wait ~60s."
```

### Retry policy

- On `403`: fix token configuration — do not retry blindly.
- On `429` or `5xx`: retry up to 3 times with exponential backoff (e.g. 1s, 2s, 4s).
- On network timeout: retry once.

### Idempotency

Safe to call multiple times for the same `shopId`. Only increases load briefly; does not corrupt data.

### Bulk / import jobs

After CSV import or batch updates for one shop: call **one** invalidate (+ prewarm) at the end of the job, not per row.

After multi-shop batch: call invalidate **once per affected `shopId`**.

---

## 8. Example commands (for ops / testing)

Replace host and token:

```bash
curl -sS -X POST "https://api.example.com/storefront/catalog/cache/invalidate" \
  -H "Content-Type: application/json" \
  -H "X-Catalog-Cache-Invalidate: YOUR_SECRET_TOKEN" \
  -d '{"shopId":"SHOP_UUID_HERE","prewarm":true,"topCategoryLimit":5}'
```

```bash
curl -sS -X POST "https://api.example.com/storefront/catalog/cache/prewarm" \
  -H "Content-Type: application/json" \
  -H "X-Catalog-Cache-Invalidate: YOUR_SECRET_TOKEN" \
  -d '{"shopId":"SHOP_UUID_HERE","topCategoryLimit":5}'
```

---

## 9. Configuration checklist (ops / backend)

Ensure production has:

| Item | Notes |
|------|--------|
| `REDIS_URL` | Storefront API connected to same Redis as cache |
| `CATALOG_CACHE_INVALIDATE_TOKEN` | Strong random secret; shared with admin backend only |
| Admin backend env | Same token value for outbound calls |
| Token not in frontend | Never embed in admin React/Vue app |

Default catalog cache TTL: `STOREFRONT_CATALOG_CACHE_TTL_SEC` (often **60**). Invalidation is still required for immediate updates; TTL alone is not enough for admin UX.

---

## 10. What this does **not** do

| Topic | Behavior |
|-------|----------|
| Customer **cart** | Always reads live DB on add/update/get — no cache clear needed |
| **Checkout** | Not cached |
| **Coupon redemption counts** | Read live from DB at cart/checkout time |
| **All search queries** | Not all list variants are prewarmed — first uncommon filter may be slower once |
| **Admin API** | If admin uses a separate service, that service must call **storefront** API URLs above |

---

## 11. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Customers still see old data after 2+ minutes | Invalidate not called or wrong `shopId` | Verify admin backend logs; call invalidate manually with curl |
| `403 Forbidden` | Token mismatch | Align admin env with API `CATALOG_CACHE_INVALIDATE_TOKEN` |
| Endpoint `404` | Token not configured on API | Set token in secrets; redeploy API |
| Slow app right after deploy | Cold cache | Invalidate + `prewarm: true` for busy shops |
| Wrong shop on custom domain | Resolve cache | Invalidate clears shop meta for that `shopId` |

---

## 12. Related technical docs

- [CACHING.md](./CACHING.md) — full cache key list and TTL reference  
- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) — production env vars  
- OpenAPI: `GET /openapi.json` — paths under **Storefront catalog**  
- Postman collection: folder **Catalog cache** (if present)

---

## 13. Contact

- **Token / Redis / API host:** platform or DevOps team  
- **Which `shopId` to pass:** same shop UUID the customer app sends as `X-Shop-Id` (or resolved from admin shop context)

---

*Document version: 2026-05 — matches storefront API cache invalidate + prewarm behavior.*
