# Catalog search — OpenSearch (deferred)

Phase 7.3b is **not implemented** in this repository. Storefront search uses PostgreSQL (`ILIKE` by default; optional `pg_trgm` when `SEARCH_USE_TRGM=true`).

## When to adopt OpenSearch

Consider a separate search service when **all** of the following are true on staging/production metrics:

- Catalog exceeds ~100k SKUs **or** contains-search p95 latency breaches your SLO with `SEARCH_USE_TRGM=true` and tuned pool/CPU
- `EXPLAIN` shows GIN trgm indexes in use but query time still unacceptable at peak
- Product needs fuzzy ranking, synonyms, or cross-shop search beyond what `pg_trgm` provides

## Planned integration shape (future PR)

1. Sync `global_products` + per-shop overlays into an index per shop (or shared index with `shopId` filter).
2. Add `SearchCatalogPort` with adapters: `postgres` (current) and `opensearch`.
3. Feature flag: `SEARCH_BACKEND=postgres|opensearch`.
4. Keep prefix/typeahead on Postgres if cheaper for your traffic mix.

Until then, enable trgm on staging, verify indexes via [`PHASE4_EXPLAIN_VERIFY.md`](./PHASE4_EXPLAIN_VERIFY.md), and size RDS before adding OpenSearch operational cost.
