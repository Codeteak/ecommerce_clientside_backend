#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health}"
IMAGE_DETAIL_FILE="${APP_DIR}/image-detail.json"

cd "${APP_DIR}"

if [[ -f "${IMAGE_DETAIL_FILE}" ]]; then
  ECR_IMAGE_URI="$(jq -r '.imageUri // empty' "${IMAGE_DETAIL_FILE}")"
  if [[ -n "${ECR_IMAGE_URI}" ]]; then
    export ECR_IMAGE_URI
  fi
fi

echo "[validate_service] Checking ${HEALTH_URL}..."

for _ in $(seq 1 20); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "[validate_service] Health check passed."
    if command -v docker-compose >/dev/null 2>&1; then
      docker-compose ps || true
    else
      docker compose ps || true
    fi
    exit 0
  fi
  sleep 3
done

echo "[validate_service] Health check failed."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose ps || true
  docker-compose logs --tail 100 api || true
else
  docker compose ps || true
  docker compose logs --tail 100 api || true
fi
exit 1
