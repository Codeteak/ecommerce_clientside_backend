#!/usr/bin/env bash
# Fail fast when CodeBuild is not ARM. This repo deploys linux/arm64 images.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

arm_print_environment_summary

if arm_is_arm_build_environment; then
  echo "assert-codebuild-arm-host: OK host_arch=$(arm_detect_host_arch)"
  exit 0
fi

echo "assert-codebuild-arm-host: FAILED"
echo "  host_arch=$(arm_detect_host_arch) (expected aarch64/arm64)"
echo "  CODEBUILD_BUILD_IMAGE=${CODEBUILD_BUILD_IMAGE:-unset}"
arm_diagnose_codebuild_project "${CODEBUILD_PROJECT_NAME:-}" "${AWS_REGION:-ap-south-1}"
echo ""
arm_print_fix_instructions "${CODEBUILD_PROJECT_NAME:-}" "${AWS_REGION:-ap-south-1}"
exit 1
