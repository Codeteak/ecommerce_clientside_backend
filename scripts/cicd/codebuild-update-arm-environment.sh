#!/usr/bin/env bash
# One-shot helper: configure CodeBuild for ARM + CloudWatch logs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT_NAME="${PROJECT_NAME:-clientSideEcommerce}"
CODEBUILD_PROJECT="${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME}-build}"
LOG_GROUP="/aws/codebuild/${CODEBUILD_PROJECT}"
ARM_ENV="type=${CODEBUILD_ARM_ENV_TYPE},image=${CODEBUILD_ARM_IMAGE},computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"
LOGS_CONFIG="cloudWatchLogs={status=ENABLED,groupName=${LOG_GROUP}},s3Logs={status=DISABLED}"

echo "==> Updating CodeBuild project"
echo "    project=${CODEBUILD_PROJECT}"
echo "    region=${AWS_REGION}"

COUNT="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" --query 'length(projects)' --output text 2>/dev/null || echo 0)"
if [[ "${COUNT}" != "1" ]]; then
  echo "ERROR: Project not found: ${CODEBUILD_PROJECT}"
  echo "Set CODEBUILD_PROJECT_NAME to the exact Build-stage project from CodePipeline."
  exit 1
fi

aws codebuild update-project \
  --name "${CODEBUILD_PROJECT}" \
  --region "${AWS_REGION}" \
  --environment "${ARM_ENV}" \
  --logs-config "${LOGS_CONFIG}" >/dev/null

echo "==> Done"
echo "    ARM: ${CODEBUILD_ARM_ENV_TYPE} / ${CODEBUILD_ARM_IMAGE}"
echo "    Logs: ENABLED (${LOG_GROUP})"
echo "Trigger a new pipeline execution and check CodeBuild logs in CloudWatch."
