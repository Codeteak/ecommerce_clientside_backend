#!/usr/bin/env bash
# Fail fast when CodeBuild is not on an ARM host (linux/arm64 images require ARM_CONTAINER).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

arm_print_environment_summary

if arm_is_arm_build_environment; then
  echo "assert-codebuild-arm-host: OK host_arch=$(arm_detect_host_arch) build_image=${CODEBUILD_BUILD_IMAGE:-n/a}"
  exit 0
fi

echo "assert-codebuild-arm-host: FAILED"
echo "  host_arch=$(arm_detect_host_arch) (expected aarch64/arm64)"
echo "  CODEBUILD_BUILD_IMAGE=${CODEBUILD_BUILD_IMAGE:-unset}"
echo ""
arm_print_fix_instructions
exit 1
