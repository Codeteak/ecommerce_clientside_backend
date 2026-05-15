# 001 deployment split migration

- `000_extensions_and_primitives.sql` contains extension + shared pre-table setup.
- `tables/*.sql` contains one ordered table block per file, including immediate table-specific constraints/indexes/upgrades from the source migration.
- `tables/033_promotion_and_category_updates.sql` contains ordered cross-table updates (backfills, function overrides, RLS/policies, and ALTER backfills) that depend on previously created tables.
- Run via **`npm run db:migrate`**, which applies `000_extensions_and_primitives.sql` then every `tables/*.sql` in numeric filename order (idempotent `CREATE IF NOT EXISTS` plus per-file upgrades such as `023_auth_refresh_tokens.sql`).
- To apply the monolithic `migrations/001_full_schema.sql` instead (not recommended for DBs that already diverged), use **`npm run db:migrate:full`**.
