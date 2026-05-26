# 001 deployment split migration

- `000_extensions_and_primitives.sql` contains extension + shared pre-table setup.
- `tables/*.sql` contains one ordered table block per file, including immediate table-specific constraints/indexes/upgrades from the source migration.
- `tables/033_promotion_and_category_updates.sql` contains ordered cross-table updates (backfills, function overrides, RLS/policies, and ALTER backfills) that depend on previously created tables.
- Run via **`npm run db:migrate`**, which applies `000_extensions_and_primitives.sql` then every `tables/*.sql` in numeric filename order (idempotent `CREATE IF NOT EXISTS` plus per-file upgrades such as `023_auth_refresh_tokens.sql`).
- To apply the monolithic `migrations/001_full_schema.sql` instead (not recommended for DBs that already diverged), use **`npm run db:migrate:full`**.
- Regenerate the monolith from split files after table changes: **`npm run db:build-full-schema`** (if that script is present).
- Phase 4 (`037`–`039`): cart index/unique, optional `pg_trgm` for search. See `docs/PHASE4_EXPLAIN_VERIFY.md`. Run `038` only after duplicate-cart audit; use `scripts/ops/dedupe-duplicate-carts.sql` if needed. Skip `039` when extensions are not allowed.
- `040_unit_size_columns.sql`: `global_products.unit_size` and cart/order line snapshots (`unit_size_snapshot`), default `1`, must be `> 0`.
- `041_shop_banner_columns.sql`: `shops.banner_enabled` (default `true`) and `shops.banner_media_asset_ids` (UUID array, max 6).
