# Storefront API — frontend guide

Interactive reference: **Swagger UI** at `/api-docs/` (when `ENABLE_API_DOCS=true`). OpenAPI JSON: `/openapi.json`.

**Base paths:** `/storefront/*` and `/api/storefront/*` (identical).

**Headers (tenant routes):**

| Header | Required |
|--------|----------|
| `Authorization: Bearer <accessToken>` | Cart, coupons, checkout, orders |
| `x-shop-id: <shop-uuid>` | Catalog, cart, coupons, checkout |

Amounts are **minor units** (INR paise). `percentBps: 1000` = 10% off.

---

## Promotion model

| Type | When applied | How FE sees it |
|------|----------------|----------------|
| **Catalog offer** | Always on product | `offer_price_minor_per_unit` on cart rows |
| **SKU campaign** | GET cart / checkout | `final_price_minor`, `promo_discount_minor`, `applied_promotion_ids` |
| **Bundle (BXGY)** | GET cart / checkout | Extra line `{itemId}:bundle-reward`, `free_quantity` |
| **Coupon** | Preview: `couponCode` on cart; commit: checkout | `promotions.coupon`, `GET /coupons`, `POST /checkout` |

There is **no** `POST /coupons/apply`. Listing is read-only; checkout commits the code.

---

## Cart

### `GET /storefront/cart`

**Query:** `couponCode` (optional) — preview only; invalid codes still return **200** with `promotions.coupon.status: "not_applicable"`.

**Response highlights:**

```json
{
  "cartId": "uuid",
  "items": [ /* paid lines + optional :bundle-reward lines */ ],
  "summary": {
    "subtotal_minor": 8100,
    "subtotal_before_coupon_minor": 9000,
    "promotion_discount_minor": 1900,
    "coupon_discount_minor": 900,
    "bundle_discount_minor": 0,
    "line_promo_discount_minor": 1000,
    "display_units_total": 3,
    "currency": "INR"
  },
  "promotions": {
    "paused": false,
    "auto": {
      "applied_promotion_ids": ["..."],
      "bundle_discount_minor": 0,
      "line_promo_discount_minor": 1000,
      "has_sku_promo": true,
      "has_bundle": false
    },
    "coupon": {
      "code": "SAVE10",
      "status": "applied",
      "discount_minor": 900,
      "reason_code": null,
      "reason_message": null
    },
    "suggested_coupons": [
      { "code": "SAVE10", "applicable": true, "reason_codes": [] }
    ]
  }
}
```

Use `summary.subtotal_before_coupon_minor` for **`GET /storefront/coupons?cartSubtotalMinor=`**.

### `POST /storefront/cart/items`

Body: `productId`, **`quantity` or `delta`**, optional `couponCode`. Returns full cart (`201`).

### `PATCH /storefront/cart/items/:itemId`

Body: **`quantity` or `delta`**, optional `couponCode`. Do not patch `:bundle-reward` ids.

### `DELETE /storefront/cart/items/:itemId`

Optional body: `{ "couponCode": "SAVE10" }`. Returns full cart (`200`).

---

## Coupons

### `GET /storefront/coupons`

| Query | Purpose |
|-------|---------|
| `cartSubtotalMinor` | From cart `subtotal_before_coupon_minor` |
| `onlyApplicable=true` | Hide ineligible (e.g. min subtotal) |
| `code` | Lookup one code |

First-order / new-customer ineligible codes are **omitted** from the list.

---

## Checkout

### `POST /storefront/checkout`

**Headers:** `Idempotency-Key` (optional, 8–128 chars) for safe retries.

**Body:**

```json
{
  "notes": "Ring bell",
  "couponCode": "SAVE10"
}
```

**201:**

```json
{
  "orderId": "uuid",
  "orderNumber": "ORD-...",
  "subtotal_minor": 8100,
  "promotion_discount_minor": 1900,
  "coupon_discount_minor": 900,
  "delivery_fee_minor": 20,
  "total_minor": 8120,
  "coupon_code": "SAVE10"
}
```

Cart is cleared on success.

**Common errors:** `COUPON_NOT_FOUND`, `MIN_SUBTOTAL_NOT_MET`, `COUPON_EXHAUSTED`, `CART_EMPTY`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `ADDRESS_REQUIRED`, `ADDRESS_NOT_SERVICEABLE`.

---

## Bundle orders (buy X get Y) — what is stored

No extra tables. Checkout writes:

| Field | Buy 2 get 1 example |
|-------|---------------------|
| `order_items.quantity` | **3** (total units customer receives: 2 paid + 1 free) |
| `order_items.line_total_minor` | Payable amount for **2** paid units only |
| `order_items.applied_promotion_ids` | `["<bundle-promotion-uuid>"]` |
| `orders.promotion_discount_total_minor` | Includes bundle savings |
| `orders.applied_promotion_ids` | All promotion UUIDs on the order |

Cart billable qty stays **2** in `cart_items`; only the **order snapshot** uses display qty **3** for fulfillment and history.

---

## Suggested flow

1. `GET /storefront/cart`
2. `GET /storefront/coupons?cartSubtotalMinor={subtotal_before_coupon_minor}`
3. User selects code → `GET /storefront/cart?couponCode=SAVE10` (preview)
4. `POST /storefront/checkout` with same `couponCode` + `Idempotency-Key`
