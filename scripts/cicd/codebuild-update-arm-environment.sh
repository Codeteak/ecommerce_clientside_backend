#!/usr/bin/env bash
# Ensure CodeBuild project uses native ARM (linux/arm64). Idempotent — safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT_NAME="${PROJECT_NAME:-clientSideEcommerce}"
CODEBUILD_PROJECT="${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME}-build}"
ARM_ENV_JSON="type=${CODEBUILD_ARM_ENV_TYPE},image=${CODEBUILD_ARM_IMAGE},computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"

echo "==> CodeBuild ARM environment (${AWS_REGION})"
echo "    project=${CODEBUILD_PROJECT}"

PROJECT_COUNT="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'length(projects)' --output text 2>/dev/null || echo 0)"
if [[ "${PROJECT_COUNT}" != "1" ]]; then
  echo "ERROR: CodeBuild project not found: ${CODEBUILD_PROJECT}"
  echo "       List projects: aws codebuild list-projects --region ${AWS_REGION}"
  echo "       Set CODEBUILD_PROJECT_NAME or PROJECT_NAME if your build project name differs."
  exit 1
fi

CURRENT_TYPE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.type' --output text)"
CURRENT_IMAGE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.image' --output text)"
CURRENT_PRIV="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.privilegedMode' --output text)"

echo "    current: type=${CURRENT_TYPE} image=${CURRENT_IMAGE} privilegedMode=${CURRENT_PRIV}"

if [[ "${CURRENT_TYPE}" == "${CODEBUILD_ARM_ENV_TYPE}" && "${CURRENT_IMAGE}" == "${CODEBUILD_ARM_IMAGE}" && "${CURRENT_PRIV}" == "True" ]]; then
  echo "==> Already configured for ARM. No update needed."
  exit 0
fi

echo "==> Updating to ARM_CONTAINER..."
aws codebuild update-project \
  --name "${CODEBUILD_PROJECT}" \
  --region "${AWS_REGION}" \
  --environment "${ARM_ENV_JSON}"

UPDATED_TYPE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.type' --output text)"
UPDATED_IMAGE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.image' --output text)"

echo "==> Updated: type=${UPDATED_TYPE} image=${UPDATED_IMAGE}"
echo "==> Start a new pipeline/build. Logs should show: assert-codebuild-arm-host: OK host_arch=aarch64"
