#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"
SECONDARY_HEALTH_URL="${SECONDARY_HEALTH_URL:-http://127.0.0.1:4100/health/ready}"
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

echo "[validate_service] Checking ${HEALTH_URL} (fallback: ${SECONDARY_HEALTH_URL})..."

for _ in $(seq 1 20); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1 || curl -fsS "${SECONDARY_HEALTH_URL}" >/dev/null 2>&1; then
    echo "[validate_service] Readiness check passed."
    compose_cmd ps || true
    exit 0
  fi
  sleep 3
done

echo "[validate_service] Readiness check failed."
compose_cmd ps || true
compose_cmd logs --tail 100 api || true
exit 1
