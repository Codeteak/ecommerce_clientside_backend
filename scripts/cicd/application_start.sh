#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-log.sh
source "${SCRIPT_DIR}/lib/deploy-log.sh"
deploy_log_init "application_start"

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
SECRET_ID="${AWS_SECRET_ID:-yaadro-ecom-prod-shop-api-runtime-env}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
IMAGE_DETAIL_FILE="${APP_DIR}/image-detail.json"

cd "${APP_DIR}"

deploy_log "[application_start] Fetching secret ${SECRET_ID} from AWS Secrets Manager..."
SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --region "${AWS_REGION}" \
  --query SecretString \
  --output text)"

METRICS_SCRAPE_TOKEN="$(echo "${SECRET_JSON}" | jq -r '.METRICS_SCRAPE_TOKEN // empty' | tr -d '\r')"
if [[ -z "${METRICS_SCRAPE_TOKEN}" ]]; then
  deploy_log "[application_start] ERROR: METRICS_SCRAPE_TOKEN is missing or empty in secret ${SECRET_ID}."
  deploy_log "[application_start] Add a non-empty METRICS_SCRAPE_TOKEN to the secret JSON, then redeploy."
  deploy_log "[application_start] Example: aws secretsmanager put-secret-value --secret-id ${SECRET_ID} --region ${AWS_REGION} --secret-string \"\$(jq '. + {METRICS_SCRAPE_TOKEN: \"<strong-random-token>\"}' <<<\"\${SECRET_JSON}\")\""
  exit 1
fi

deploy_log "[application_start] Writing .env from secret (excluding doc flags; production overrides applied below)..."
rm -f .env
echo "${SECRET_JSON}" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' | tr -d '\r' \
  | grep -vE '^(ENABLE_API_DOCS|ALLOW_API_DOCS_IN_PRODUCTION)=' > .env

deploy_log "[application_start] Appending runtime overrides..."
{
  echo "NODE_ENV=production"
  echo "PORT=4100"
  echo "ENABLE_API_DOCS=false"
  echo "ALLOW_API_DOCS_IN_PRODUCTION=false"
  echo "DATABASE_SSL_REJECT_UNAUTHORIZED=${DATABASE_SSL_REJECT_UNAUTHORIZED:-false}"
  echo "TRUST_PROXY=true"
  echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET:-$(openssl rand -base64 32)}"
} >> .env

if [[ ! -f "${IMAGE_DETAIL_FILE}" ]]; then
  deploy_log "[application_start] Missing ${IMAGE_DETAIL_FILE}. Build artifact is incomplete."
  exit 1
fi

ECR_IMAGE_URI="$(jq -r '.imageUri // empty' "${IMAGE_DETAIL_FILE}")"
if [[ -z "${ECR_IMAGE_URI}" ]]; then
  deploy_log "[application_start] imageUri not found in ${IMAGE_DETAIL_FILE}"
  exit 1
fi

deploy_log "[application_start] Using image ${ECR_IMAGE_URI}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export ECR_IMAGE_URI

compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

deploy_log "[application_start] Pulling images and restarting services..."
compose_cmd pull
compose_cmd down --remove-orphans
compose_cmd up -d --force-recreate

deploy_log "[application_start] Container status:"
compose_cmd ps | tee -a "${DEPLOY_LOG}" || true

deploy_log "[application_start] Deployment complete. Host log: ${DEPLOY_LOG}"
