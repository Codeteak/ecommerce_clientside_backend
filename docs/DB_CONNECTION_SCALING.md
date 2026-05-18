# Database connection scaling

Use this guide when running **multiple API replicas**, a separate **outbox worker**, or approaching PostgreSQL `max_connections` limits.

## Connection budget formula

```
app_connections ≈ (api_replicas + outbox_worker_replicas) × DATABASE_POOL_MAX
```

Add headroom for migrations, admin consoles, and RDS maintenance (typically 10–20% of `max_connections`).

**Example:** 4 API tasks + 1 outbox worker, each with `DATABASE_POOL_MAX=30` → up to **150** client connections from this service alone.

## Per-task pool settings

| Variable | Default (prod) | Role |
|----------|----------------|------|
| `DATABASE_POOL_MAX` | Overrides env-specific max when set | Hard cap per Node process |
| `DATABASE_POOL_MAX_PROD` | 30 | Used when `NODE_ENV=production` and `DATABASE_POOL_MAX` unset |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | 10000 | Idle connections returned to pool |
| `DATABASE_POOL_MAX_DEV` | 12 | Local development |
| `DATABASE_POOL_MAX_TEST` | 4 | Vitest |

Implementation: [`src/infra/db/pool.js`](../src/infra/db/pool.js).

## Recommendations by scale

### Few replicas (1–3 API tasks)

- `DATABASE_POOL_MAX_PROD=20–30` is usually fine on a small RDS instance (`max_connections` ≥ 100).
- Monitor RDS `DatabaseConnections` and slow-query log.

### Many replicas (5+ API tasks) or connection warnings

1. **Lower per-task max** — e.g. `DATABASE_POOL_MAX=10` or `15` per API task so total stays under RDS limit.
2. **RDS Proxy or PgBouncer** — pool at the proxy layer; app pools can be smaller (often 5–15 per task).
3. **Dedicated outbox worker** — counts as its own task in the formula; do not forget it when sizing.

### With RDS Proxy

- Point `DATABASE_URL` at the **proxy endpoint**, not the cluster endpoint.
- Use IAM or Secrets Manager as per your AWS setup.
- Typical app setting: `DATABASE_POOL_MAX=10–15` per API replica; proxy multiplexes to Postgres.

## When to adopt RDS Proxy

- You plan **horizontal scaling** beyond ~5 API tasks.
- You see `too many connections` or frequent connection churn in logs.
- You need **failover-friendly** connection handling without exhausting DB slots during deploys.

PgBouncer (self-managed) is an alternative with similar goals.

## Deploy checklist

- [ ] Compute `app_connections` before adding replicas
- [ ] Set `DATABASE_POOL_MAX` (or lower `DATABASE_POOL_MAX_PROD`) per environment
- [ ] Include outbox worker replicas in the count
- [ ] Reserve connections for non-app clients (BI, migrations, support)
- [ ] After scale-out, watch RDS connection count for 24h

## Related docs

- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) — required env and multi-instance layout
- [PHASE4_EXPLAIN_VERIFY.md](./PHASE4_EXPLAIN_VERIFY.md) — query/index verification after schema changes
