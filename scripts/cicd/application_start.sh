#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
HOST_RUNTIME_CONF="/etc/yaadro/app-runtime.conf"

if [[ -f "${HOST_RUNTIME_CONF}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${HOST_RUNTIME_CONF}"
  set +a
fi

# Shared secret only. Ignore legacy per-service names (e.g. shop-api-runtime-env) from host conf.
SHARED_RUNTIME_SECRET="yaadro-ecom-prod-runtime-env"
SECRET_ID="${APP_ENV_SECRET_ID:-${AWS_SECRET_ID:-${SHARED_RUNTIME_SECRET}}}"
case "${SECRET_ID}" in
  *shop-api-runtime-env*|*customer*runtime-env*|*superadmin*runtime-env*|*mapper*runtime-env*)
    echo "[application_start] Remapping legacy secret '${SECRET_ID}' -> '${SHARED_RUNTIME_SECRET}'"
    SECRET_ID="${SHARED_RUNTIME_SECRET}"
    ;;
esac
SECRET_PREFIX="${APP_ENV_SECRET_PREFIX:-CUSTOMER_}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
IMAGE_DETAIL_FILE="${APP_DIR}/image-detail.json"
APP_PORT="${APP_PORT:-4100}"

cd "${APP_DIR}"

echo "[application_start] Writing .env from AWS Secrets Manager (${SECRET_ID}, prefix ${SECRET_PREFIX})..."
rm -f .env
aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --region "${AWS_REGION}" \
  --query SecretString \
  --output text | APP_ENV_SECRET_PREFIX="${SECRET_PREFIX}" python3 -c '
import json, os, sys
data = json.load(sys.stdin)
prefix = os.environ.get("APP_ENV_SECRET_PREFIX", "CUSTOMER_")
common = "COMMON_"
known = ("COMMON_", "SHOP_API_", "CUSTOMER_", "SUPERADMIN_", "MAPPER_")
out = {}
has_prefixed = any(isinstance(k, str) and k.startswith(known) for k in data)
if has_prefixed:
    for k, v in data.items():
        if isinstance(v, (dict, list)) or not isinstance(k, str):
            continue
        if k.startswith(common):
            out[k[len(common):]] = str(v)
    for k, v in data.items():
        if isinstance(v, (dict, list)) or not isinstance(k, str):
            continue
        if k.startswith(prefix):
            out[k[len(prefix):]] = str(v)
else:
    for k, v in data.items():
        if isinstance(v, (dict, list)):
            continue
        out[str(k)] = str(v)
skip = {"ENABLE_API_DOCS", "ALLOW_API_DOCS_IN_PRODUCTION"}
for k in sorted(out):
    if k in skip:
        continue
    print(f"{k}={out[k]}")
' | tr -d '\r' > .env

if grep -q '^CUSTOMER_PORT=' .env; then
  APP_PORT="$(grep -m1 '^CUSTOMER_PORT=' .env | cut -d= -f2- | tr -d '\r')"
fi

echo "[application_start] Appending runtime overrides..."
{
  echo "NODE_ENV=production"
  echo "CUSTOMER_PORT=${APP_PORT}"
  echo "DATABASE_SSL_REJECT_UNAUTHORIZED=${DATABASE_SSL_REJECT_UNAUTHORIZED:-false}"
  echo "TRUST_PROXY=true"
  # Stripped from Secrets Manager above; schema defaults missing ENABLE_API_DOCS to true.
  echo "ENABLE_API_DOCS=false"
  echo "ALLOW_API_DOCS_IN_PRODUCTION=false"
} >> .env

if ! grep -q '^JWT_REFRESH_SECRET=' .env; then
  echo "[application_start] Missing JWT_REFRESH_SECRET in AWS secret ${SECRET_ID}."
  echo "[application_start] Refusing to auto-generate a production refresh secret."
  exit 1
fi

if [[ ! -f "${IMAGE_DETAIL_FILE}" ]]; then
  echo "[application_start] Missing ${IMAGE_DETAIL_FILE}. Build artifact is incomplete."
  exit 1
fi

ECR_IMAGE_URI="$(jq -r '.imageUri // empty' "${IMAGE_DETAIL_FILE}")"
if [[ -z "${ECR_IMAGE_URI}" ]]; then
  echo "[application_start] imageUri not found in ${IMAGE_DETAIL_FILE}"
  exit 1
fi

echo "[application_start] Using image ${ECR_IMAGE_URI}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export ECR_IMAGE_URI

COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "[application_start] Missing ${COMPOSE_FILE}"
  ls -la "${APP_DIR}" || true
  exit 1
fi

export CUSTOMER_PORT="${APP_PORT}"

echo "[application_start] Restarting services with ${COMPOSE_FILE} (port ${CUSTOMER_PORT})..."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f "${COMPOSE_FILE}" pull
  docker-compose -f "${COMPOSE_FILE}" down --remove-orphans
  docker-compose -f "${COMPOSE_FILE}" up -d --force-recreate
else
  docker compose -f "${COMPOSE_FILE}" pull
  docker compose -f "${COMPOSE_FILE}" down --remove-orphans
  docker compose -f "${COMPOSE_FILE}" up -d --force-recreate
fi

echo "[application_start] Deployment complete."
