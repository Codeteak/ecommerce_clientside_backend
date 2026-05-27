#!/usr/bin/env bash
# Ensure CodeBuild runs on ARM for linux/arm64. Optionally self-heals project settings via AWS API.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"
# shellcheck source=scripts/cicd/lib/codebuild-project-config.sh
. "${SCRIPT_DIR}/lib/codebuild-project-config.sh"

SELF_HEAL="${CODEBUILD_SELF_HEAL_ARM:-1}"

arm_print_environment_summary

if arm_is_arm_build_environment; then
  echo "ensure-codebuild-arm-host: OK host_arch=$(arm_detect_host_arch)"
  exit 0
fi

echo "ensure-codebuild-arm-host: host is not ARM (host_arch=$(arm_detect_host_arch))"
arm_diagnose_codebuild_project

if [[ "${SELF_HEAL}" == "1" && -n "${CODEBUILD_PROJECT_NAME:-}" ]]; then
  echo "ensure-codebuild-arm-host: attempting to fix CodeBuild project ${CODEBUILD_PROJECT_NAME}..."
  set +e
  codebuild_apply_arm_and_logs "${AWS_REGION:-ap-south-1}"
  apply_rc=$?
  set -e
  if [[ "${apply_rc}" == "0" ]]; then
    cat <<EOF

ensure-codebuild-arm-host: CodeBuild project was updated to ARM_CONTAINER.
This running build cannot change CPU architecture mid-flight.

>>> In CodePipeline: click "Retry failed stage" on the Build stage (or start a new execution).
>>> The next build should show: ensure-codebuild-arm-host: OK host_arch=aarch64

EOF
    exit 1
  fi
  echo "ensure-codebuild-arm-host: auto-fix failed (exit ${apply_rc}). Add IAM: codebuild:UpdateProject on this project."
fi

echo ""
echo "ensure-codebuild-arm-host: FAILED — fix manually from your laptop:"
arm_print_fix_instructions "${CODEBUILD_PROJECT_NAME:-}" "${AWS_REGION:-ap-south-1}"
exit 1
