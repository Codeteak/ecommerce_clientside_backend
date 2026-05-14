# Storefront catalog — pricing & bundle rules (implementation report)

**Updated:** 2026-05-14  
**Scope:** `GET /storefront/products`, `GET /storefront/products/{slug}`, `GET /storefront/products/id/{id}`.

---

## 1. Pricing (three fields only)

Each product exposes **only** these monetary fields (integer minor units as **strings**):

| Field | Source | Notes |
|-------|--------|--------|
| **`actual_price_minor`** | `shop_products.price_minor_per_unit` | List / MRP. |
| **`offer_price_minor`** | `shop_products.offer_price_minor_per_unit` | `null` when not set in catalog. |
| **`promo_price_minor`** | Winning `promotion_products.promo_price_minor_per_unit` | `null` when no active campaign overlay for this SKU, or when `promotions_paused`. |

Legacy response keys **`price_minor_per_unit`**, **`offer_price_minor_per_unit`**, and the older computed fields (`baseline_unit_price_minor`, `effective_unit_price_minor`, etc.) are **not** returned on list/detail after enrichment.

**Semantics:** `promo_price_minor` is the **campaign unit selling price** (replacement), not a discount delta subtracted from list or offer.

**Filters / sort:** `min_price_minor` / `max_price_minor` and `sort_by=price` still use **catalog baseline** in SQL (`catalogBaselineUnitSql.js` — offer when strictly below list, else list).

---

## 2. Bundle rules (per product)

- **`bundle_rules`**: array on **each** product (flat `products` and nested `categories[].products`).
- Rules included when:
  - `scope = 'same_shop_product'` and `shop_product_id` matches the product’s `shop_products.id`, or
  - `scope = 'global_category'` and `global_category_id` matches the product’s category.
- Omitted from root response: there is **no** `active_bundle_rules` array on the list payload anymore.
- When **`promotions_paused`**, `bundle_rules` is `[]` for every product.

Implementation: `filterBundleRuleRowsForProduct` + `mapActiveBundleRuleRow` in `mapActiveBundleRulesPublic.js`; list loads shop bundle rows once then filters per SKU.

---

## 3. Product detail

Same three price fields + **`bundle_rules`** (from `listActiveBundleRulesForProduct` — same logical filter as list).

---

## 4. Caching

- Product list catalog SWR key: **`v6`** (response shape change).

---

## 5. No campaigns / safe fallback

| Situation | Behaviour |
|-----------|-----------|
| No eligible campaigns or no `promotion_products` rows for page SKUs | Overlay query returns `[]` → **`promo_price_minor`** is **`null`** for every product; **`actual_price_minor`** / **`offer_price_minor`** still come from **`shop_products`**. **`bundle_rules`** is `[]` unless bundle rows exist for that SKU/category. |
| **`promotions_paused`** | Same as no overlay: **`promo_price_minor`** null; **`bundle_rules`** `[]`. |
| **`pool` / `promotionRepo` not wired** | Same catalog-only behaviour (e.g. tests). |
| **Promotion SQL errors** (missing tables, RLS, etc.) | **`storefrontCatalog.js`** catches errors, logs **`storefront_listing_promotions_fallback`** / **`storefront_detail_promotions_fallback`**, and returns the same catalog-only result so **products still list**. |

---

## 6. Code map

| Concern | File |
|---------|------|
| Promo winner → `promoPriceMinor` | `resolveStorefrontSkuUnitPrices.js` → `buildStorefrontListingUnitPriceMap` |
| Three-field API merge (list) | `withStorefrontProductPricing` |
| Three-field API merge (detail) | `withStorefrontDetailPricing` |
| Per-product bundle filter | `filterBundleRuleRowsForProduct` |
| Orchestration + DB error fallback | `storefrontCatalog.js` (`catalogOnlyPromotionContext`, try/catch) |

---

*Cart-level BXGY amounts still require checkout logic.*
