#!/usr/bin/env bash
# Enable CloudWatch Logs on the CodeBuild project (fixes "CloudWatch logs DISABLED" in console).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/codebuild-project-config.sh
. "${SCRIPT_DIR}/lib/codebuild-project-config.sh"

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT="$(codebuild_resolve_project_name)"
LOG_GROUP="/aws/codebuild/${PROJECT}"
LOGS_CONFIG="$(codebuild_logs_config "${PROJECT}")"

echo "==> Enabling CloudWatch Logs"
echo "    project=${PROJECT}"
echo "    region=${AWS_REGION}"
echo "    log_group=${LOG_GROUP}"

COUNT="$(aws codebuild batch-get-projects --names "${PROJECT}" --region "${AWS_REGION}" \
  --query 'length(projects)' --output text 2>/dev/null || echo 0)"
if [[ "${COUNT}" != "1" ]]; then
  echo "ERROR: Project not found: ${PROJECT}. Set CODEBUILD_PROJECT_NAME to match CodePipeline Build stage."
  exit 1
fi

aws codebuild update-project \
  --name "${PROJECT}" \
  --region "${AWS_REGION}" \
  --logs-config "${LOGS_CONFIG}"

echo "==> Done. Confirm in console: CloudWatch logs = ENABLED, group = ${LOG_GROUP}"
echo "    Start a new build, then CodeBuild → Build history → View entire log"
