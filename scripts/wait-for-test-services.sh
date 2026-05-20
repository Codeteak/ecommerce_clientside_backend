#!/usr/bin/env bash
set -euo pipefail

PG_HOST="${INTEGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${INTEGRATION_PG_PORT:-5433}"
REDIS_HOST="${INTEGRATION_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${INTEGRATION_REDIS_PORT:-6380}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-90}"

can_connect_tcp() {
  # Use bash built-in TCP sockets as a no-dependency fallback in CI.
  local host="$1"
  local port="$2"
  (echo >"/dev/tcp/${host}/${port}") >/dev/null 2>&1
}

wait_pg() {
  # Fresh deadline per service: a slow Postgres must not steal Redis's wait budget.
  local end=$((SECONDS + MAX_WAIT_SEC))
  while [ "$SECONDS" -lt "$end" ]; do
    if command -v pg_isready >/dev/null 2>&1; then
      if pg_isready -h "$PG_HOST" -p "$PG_PORT" -U postgres -d ecommerce_test >/dev/null 2>&1; then
        return 0
      fi
    elif command -v nc >/dev/null 2>&1; then
      if nc -z "$PG_HOST" "$PG_PORT" 2>/dev/null; then
        return 0
      fi
    elif can_connect_tcp "$PG_HOST" "$PG_PORT"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_redis() {
  local end=$((SECONDS + MAX_WAIT_SEC))
  while [ "$SECONDS" -lt "$end" ]; do
    if command -v redis-cli >/dev/null 2>&1; then
      if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then
        return 0
      fi
    elif command -v nc >/dev/null 2>&1; then
      if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
        return 0
      fi
    elif can_connect_tcp "$REDIS_HOST" "$REDIS_PORT"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

compose_diagnose() {
  local compose_file="${INTEGRATION_COMPOSE_FILE:-docker-compose.test.yml}"
  if [ -f "$compose_file" ]; then
    echo "=== docker compose ps ($compose_file) ==="
    docker compose -f "$compose_file" ps -a 2>&1 || true
    echo "=== docker compose logs (tail) ==="
    docker compose -f "$compose_file" logs --tail 80 2>&1 || true
  fi
}

echo "Waiting for Postgres at ${PG_HOST}:${PG_PORT}..."
wait_pg || {
  echo "Postgres not ready after ${MAX_WAIT_SEC}s"
  compose_diagnose
  exit 1
}
echo "Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
wait_redis || {
  echo "Redis not ready after ${MAX_WAIT_SEC}s"
  compose_diagnose
  exit 1
}
echo "Test services are ready."
