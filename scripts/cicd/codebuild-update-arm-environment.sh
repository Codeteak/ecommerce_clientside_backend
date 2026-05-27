#!/usr/bin/env bash
# Configure CodeBuild for this repo: native ARM + CloudWatch Logs (live build output).
# Idempotent — safe to re-run from your laptop with AWS CLI credentials.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT_NAME="${PROJECT_NAME:-clientSideEcommerce}"
CODEBUILD_PROJECT="${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME}-build}"
LOG_GROUP="/aws/codebuild/${CODEBUILD_PROJECT}"
ARM_ENV_JSON="type=${CODEBUILD_ARM_ENV_TYPE},image=${CODEBUILD_ARM_IMAGE},computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"
LOGS_CONFIG="cloudWatchLogs={status=ENABLED,groupName=${LOG_GROUP}},s3Logs={status=DISABLED}"

print_log_viewing_help() {
  cat <<EOF

--- Where to see logs ---

BUILD (CodeBuild) — live output while the build runs:
  1. CodePipeline → your pipeline → execution → Build stage → "Details" / build action
  2. Open the link "AWS CodeBuild" / "View in CodeBuild" (or "View logs in CloudWatch")
  3. Or: CodeBuild → Projects → ${CODEBUILD_PROJECT} → Build history → build → "View entire log"
  4. CloudWatch → Log groups → ${LOG_GROUP} → latest log stream

  CodePipeline does NOT embed full build logs in the pipeline timeline; it links to CodeBuild/CloudWatch.

DEPLOY (CodeDeploy) — not streamed in CodePipeline:
  1. CodePipeline → Deploy stage → link to CodeDeploy deployment
  2. CodeDeploy → Deployments → open deployment → Events (hook success/failure)
  3. On each EC2 instance:
       sudo tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log
       sudo find /opt/codedeploy-agent/deployment-root -name scripts.log | tail -1 | xargs sudo tail -f
  4. App container after deploy:
       cd /home/deploy/yaadro/ecommerce_clientside_backend && docker compose logs -f api

CodeBuild service role must allow (if logs still empty after enabling):
  logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
EOF
}

echo "==> CodeBuild project configuration (${AWS_REGION})"
echo "    project=${CODEBUILD_PROJECT}"
echo "    log_group=${LOG_GROUP}"

PROJECT_COUNT="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'length(projects)' --output text 2>/dev/null || echo 0)"
if [[ "${PROJECT_COUNT}" != "1" ]]; then
  echo "ERROR: CodeBuild project not found: ${CODEBUILD_PROJECT}"
  echo "       List projects: aws codebuild list-projects --region ${AWS_REGION}"
  echo "       Set CODEBUILD_PROJECT_NAME if your pipeline uses a different build project."
  exit 1
fi

CURRENT_TYPE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.type' --output text)"
CURRENT_IMAGE="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.image' --output text)"
CURRENT_PRIV="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].environment.privilegedMode' --output text)"
CURRENT_LOG_STATUS="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].logsConfig.cloudWatchLogs.status' --output text)"
CURRENT_LOG_GROUP="$(aws codebuild batch-get-projects --names "${CODEBUILD_PROJECT}" --region "${AWS_REGION}" \
  --query 'projects[0].logsConfig.cloudWatchLogs.groupName' --output text)"

echo "    environment: type=${CURRENT_TYPE} image=${CURRENT_IMAGE} privilegedMode=${CURRENT_PRIV}"
echo "    cloudWatchLogs: status=${CURRENT_LOG_STATUS} group=${CURRENT_LOG_GROUP:-n/a}"

NEED_ARM=false
NEED_LOGS=false
if [[ "${CURRENT_TYPE}" != "${CODEBUILD_ARM_ENV_TYPE}" || "${CURRENT_IMAGE}" != "${CODEBUILD_ARM_IMAGE}" || "${CURRENT_PRIV}" != "True" ]]; then
  NEED_ARM=true
fi
if [[ "${CURRENT_LOG_STATUS}" != "ENABLED" || "${CURRENT_LOG_GROUP}" != "${LOG_GROUP}" ]]; then
  NEED_LOGS=true
fi

if [[ "${NEED_ARM}" == "false" && "${NEED_LOGS}" == "false" ]]; then
  echo "==> Already configured (ARM + CloudWatch Logs). No update needed."
  print_log_viewing_help
  exit 0
fi

if [[ "${NEED_ARM}" == "true" && "${NEED_LOGS}" == "true" ]]; then
  echo "==> Updating ARM environment and CloudWatch Logs..."
  aws codebuild update-project \
    --name "${CODEBUILD_PROJECT}" \
    --region "${AWS_REGION}" \
    --environment "${ARM_ENV_JSON}" \
    --logs-config "${LOGS_CONFIG}"
elif [[ "${NEED_ARM}" == "true" ]]; then
  echo "==> Updating ARM environment..."
  if [[ "${NEED_LOGS}" == "true" ]]; then
    aws codebuild update-project \
      --name "${CODEBUILD_PROJECT}" \
      --region "${AWS_REGION}" \
      --environment "${ARM_ENV_JSON}" \
      --logs-config "${LOGS_CONFIG}"
  else
    aws codebuild update-project \
      --name "${CODEBUILD_PROJECT}" \
      --region "${AWS_REGION}" \
      --environment "${ARM_ENV_JSON}"
  fi
elif [[ "${NEED_LOGS}" == "true" ]]; then
  echo "==> Enabling CloudWatch Logs (this is why CodePipeline often shows no build output)..."
  aws codebuild update-project \
    --name "${CODEBUILD_PROJECT}" \
    --region "${AWS_REGION}" \
    --logs-config "${LOGS_CONFIG}"
fi

echo "==> Done. Start a new pipeline execution (not only Retry)."
print_log_viewing_help
