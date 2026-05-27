#!/usr/bin/env bash
# Configure CodeBuild for this repo: native ARM + CloudWatch Logs. Run from laptop with AWS CLI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"
# shellcheck source=scripts/cicd/lib/codebuild-project-config.shh
. "${SCRIPT_DIR}/lib/codebuild-project-config.sh"

AWS_REGION="${AWS_REGION:-ap-south-1}"
CODEBUILD_PROJECT="$(codebuild_resolve_project_name)"
LOG_GROUP="/aws/codebuild/${CODEBUILD_PROJECT}"

print_log_viewing_help() {
  cat <<EOF

--- Where to see logs ---

BUILD: CodePipeline → Build stage → View in CodeBuild / CloudWatch
       Log group: ${LOG_GROUP}

DEPLOY: CodeDeploy → Deployments → Events (not shown live in CodePipeline)

CodeBuild service role needs: logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents
EOF
}

echo "==> CodeBuild project configuration (${AWS_REGION})"
echo "    project=${CODEBUILD_PROJECT}"

set +e
codebuild_apply_arm_and_logs "${AWS_REGION}"
rc=$?
set -e

if [[ "${rc}" == "1" ]]; then
  echo "ERROR: project not found. Set CODEBUILD_PROJECT_NAME or PROJECT_NAME."
  exit 1
fi
if [[ "${rc}" == "2" ]]; then
  echo "ERROR: aws codebuild update-project failed."
  exit 1
fi

print_log_viewing_help
