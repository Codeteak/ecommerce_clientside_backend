# Phase 4 — EXPLAIN verification (staging / production)

Run against a shop with realistic data. Replace UUIDs and customer id as needed.

## Cart lookup (4.1)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, shop_id, customer_id, created_at
  FROM carts
 WHERE shop_id = '00000000-0000-4000-8000-000000000001'::uuid
   AND customer_id = 'your-customer-id'
 LIMIT 1;
```

Expected: `Index Scan using idx_carts_shop_customer` (or `Bitmap Index Scan` on that index).

## Duplicate carts audit (4.2)

```sql
SELECT shop_id, customer_id, COUNT(*) AS n
  FROM carts
 GROUP BY shop_id, customer_id
HAVING COUNT(*) > 1;
```

Expected: **0 rows** before applying `038_carts_shop_customer_unique.sql`.

## Product search — prefix mode (4.3a)

With `search_mode=prefix` and term `mil`, pattern should be `mil%` (no leading `%`).

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT gp.id
  FROM shop_products sp
  JOIN global_products gp ON gp.id = sp.global_product_id
 WHERE sp.shop_id = '00000000-0000-4000-8000-000000000001'::uuid
   AND sp.status = 'active'
   AND (gp.name ILIKE 'mil%' ESCAPE '\' OR gp.slug ILIKE 'mil%' ESCAPE '\')
 LIMIT 24;
```

## Product search — trigram contains (Phase 7.3a, `SEARCH_USE_TRGM=true`)

Set `SEARCH_USE_TRGM=true` on the API task. Contains mode uses the `%` operator (not leading-wildcard `ILIKE`).

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT gp.id
  FROM shop_products sp
  JOIN global_products gp ON gp.id = sp.global_product_id
 WHERE sp.shop_id = '00000000-0000-4000-8000-000000000001'::uuid
   AND sp.status = 'active'
   AND (gp.name % 'milk' OR gp.slug % 'milk')
 ORDER BY similarity(gp.name, 'milk') DESC
 LIMIT 24;
```

Expected with `pg_trgm` + GIN: `Bitmap Index Scan` on `idx_global_products_name_trgm` / slug index (or nested loop with index condition).

Prefix mode (`search_mode=prefix`) remains `ILIKE 'term%'` and is unchanged when trgm is enabled.

## Category list — sellable filter (4.4)

After deploy, category cache miss should run one sellable-category-id query plus a simple category filter (no per-row recursive `EXISTS` in `listCategoriesStorefront`).
