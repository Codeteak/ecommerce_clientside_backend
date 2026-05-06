# 001 deployment split migration

- `000_extensions_and_primitives.sql` contains extension + shared pre-table setup.
- `tables/*.sql` contains one ordered table block per file, including immediate table-specific constraints/indexes/upgrades from the source migration.
- Run via `../001_deployment_postgresql.sql` so files execute in dependency-safe order.
