#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"
SECRET_ID="${AWS_SECRET_ID:-yaadro-ecom-prod-shop-api-runtime-env}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
IMAGE_DETAIL_FILE="${APP_DIR}/image-detail.json"

cd "${APP_DIR}"

echo "[application_start] Writing .env from AWS Secrets Manager..."
rm -f .env
aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --region "${AWS_REGION}" \
  --query SecretString \
  --output text | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' | tr -d '\r' > .env

echo "[application_start] Appending runtime overrides..."
{
  echo "NODE_ENV=production"
  echo "PORT=4100"
  echo "DATABASE_SSL_REJECT_UNAUTHORIZED=true"
  echo "TRUST_PROXY=true"
  echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET:-$(openssl rand -base64 32)}"
} >> .env

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

echo "[application_start] Restarting services..."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose pull
  docker-compose down --remove-orphans
  docker-compose up -d --force-recreate
else
  docker compose pull
  docker compose down --remove-orphans
  docker compose up -d --force-recreate
fi

echo "[application_start] Deployment complete."
