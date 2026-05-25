#!/usr/bin/env bash
# Unit tests for CodeBuild — clear deploy env vars so test defaults apply (see buildEnv.js).
set -euo pipefail

export NODE_ENV=test
export RUN_INTEGRATION_TESTS=0

# Unset deploy secrets/URLs (buildEnv also forces unit-test overrides when vitest loads).
for key in \
  CORS_ORIGIN \
  API_PUBLIC_URL \
  DATABASE_URL \
  REDIS_URL \
  JWT_SECRET \
  JWT_REFRESH_SECRET \
  JWT_PREVIOUS_SECRET \
  JWT_PREVIOUS_REFRESH_SECRET \
  SERVICEABILITY_COOKIE_SECRET \
  OBJECT_STORAGE_PUBLIC_BASE_URL \
  STOREFRONT_ROOT_DOMAIN \
  MSG_AUTH_KEY \
  MSG91_AUTHKEY \
  OTP_TEMPLATE_ID \
  MSG91_TEMPLATE_ID \
  METRICS_SCRAPE_TOKEN \
  CATALOG_CACHE_INVALIDATE_TOKEN \
  SENTRY_DSN \
  GOOGLE_CLIENT_ID \
  GOOGLE_CLIENT_SECRET \
  DISABLE_RATE_LIMITING; do
  unset "$key" 2>/dev/null || true
done

if [ "${1:-}" = "watch" ]; then
  shift
  exec npx vitest "$@"
fi

exec npx vitest run "$@"
