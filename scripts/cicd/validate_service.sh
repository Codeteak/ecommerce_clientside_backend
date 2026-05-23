#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-log.sh
source "${SCRIPT_DIR}/lib/deploy-log.sh"
deploy_log_init "validate_service"

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/health/ready}"
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

dump_failure_logs() {
  deploy_log "[validate_service] --- docker compose ps ---"
  compose_cmd ps 2>&1 | tee -a "${DEPLOY_LOG}" || true
  deploy_log "[validate_service] --- api logs (last 150 lines) ---"
  compose_cmd logs --tail 150 api 2>&1 | tee -a "${DEPLOY_LOG}" || true
  deploy_log "[validate_service] --- outbox-worker logs (last 150 lines) ---"
  compose_cmd logs --tail 150 outbox-worker 2>&1 | tee -a "${DEPLOY_LOG}" || true
}

deploy_log "[validate_service] Checking ${HEALTH_URL}..."

for attempt in $(seq 1 20); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    deploy_log "[validate_service] Readiness check passed (attempt ${attempt})."
    compose_cmd ps | tee -a "${DEPLOY_LOG}" || true
    exit 0
  fi
  deploy_log "[validate_service] Attempt ${attempt}/20: not ready yet, waiting 3s..."
  sleep 3
done

deploy_log "[validate_service] Readiness check failed after 20 attempts."
dump_failure_logs
exit 1
