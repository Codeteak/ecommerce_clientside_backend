# 001 deployment split migration

- `000_extensions_and_primitives.sql` contains extension + shared pre-table setup.
- `tables/*.sql` contains one ordered table block per file, including immediate table-specific constraints/indexes/upgrades from the source migration.
- `tables/033_promotion_and_category_updates.sql` contains ordered cross-table updates (backfills, function overrides, RLS/policies, and ALTER backfills) that depend on previously created tables.
- Run via `../001_deployment_postgresql.sql` so files execute in dependency-safe order.
