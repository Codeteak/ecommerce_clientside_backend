#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"
SECONDARY_HEALTH_URL="${SECONDARY_HEALTH_URL:-http://127.0.0.1:4100/health/ready}"
MAX_ATTEMPTS="${VALIDATE_MAX_ATTEMPTS:-60}"
SLEEP_SECONDS="${VALIDATE_SLEEP_SECONDS:-3}"
IMAGE_DETAIL_FILE="${APP_DIR}/image-detail.json"

cd "${APP_DIR}"

if [[ -f "${IMAGE_DETAIL_FILE}" ]]; then
  ECR_IMAGE_URI="$(jq -r '.imageUri // empty' "${IMAGE_DETAIL_FILE}")"
  if [[ -n "${ECR_IMAGE_URI}" ]]; then
    export ECR_IMAGE_URI
  fi
fi

compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

echo "[validate_service] Checking ${HEALTH_URL} (fallback: ${SECONDARY_HEALTH_URL}, max attempts: ${MAX_ATTEMPTS}, interval: ${SLEEP_SECONDS}s)..."

for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  if curl -fsS --max-time 2 "${HEALTH_URL}" >/dev/null 2>&1 || curl -fsS --max-time 2 "${SECONDARY_HEALTH_URL}" >/dev/null 2>&1; then
    echo "[validate_service] Readiness check passed."
    compose_cmd ps || true
    exit 0
  fi
  if (( attempt % 10 == 0 )); then
    echo "[validate_service] Still waiting for health check... (${attempt}/${MAX_ATTEMPTS})"
  fi
  sleep "${SLEEP_SECONDS}"
done

echo "[validate_service] Readiness check failed."
compose_cmd ps || true
compose_cmd logs --tail 100 api || true
exit 1
