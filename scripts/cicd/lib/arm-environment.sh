#!/usr/bin/env bash
# Shared ARM host/image detection for CodeBuild (linux/arm64 deploy target).
# Source: . "$(dirname "$0")/lib/arm-environment.sh"  (from scripts/cicd/)

CODEBUILD_ARM_IMAGE="aws/codebuild/amazonlinux2-aarch64-standard:3.0"
CODEBUILD_ARM_ENV_TYPE="ARM_CONTAINER"

arm_detect_host_arch() {
  uname -m
}

arm_is_arm_host() {
  case "$(arm_detect_host_arch)" in
    aarch64 | arm64) return 0 ;;
    *) return 1 ;;
  esac
}

arm_is_arm_image() {
  local img="${1:-${CODEBUILD_BUILD_IMAGE:-}}"
  [[ "${img}" == *aarch64* || "${img}" == *arm64* ]]
}

arm_is_arm_build_environment() {
  arm_is_arm_host || arm_is_arm_image "${CODEBUILD_BUILD_IMAGE:-}"
}

arm_print_environment_summary() {
  echo "arm-environment: host_arch=$(arm_detect_host_arch)"
  echo "arm-environment: CODEBUILD_BUILD_IMAGE=${CODEBUILD_BUILD_IMAGE:-unset}"
  echo "arm-environment: CODEBUILD_PROJECT_NAME=${CODEBUILD_PROJECT_NAME:-unset}"
  echo "arm-environment: CODEBUILD_BUILD_ID=${CODEBUILD_BUILD_ID:-unset}"
}

arm_print_fix_instructions() {
  local project="${1:-${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME:-clientSideEcommerce}-build}}"
  local region="${2:-${AWS_REGION:-ap-south-1}}"
  cat <<EOF
This pipeline builds linux/arm64. Use a native ARM CodeBuild environment.

  PROJECT_NAME=${PROJECT_NAME:-clientSideEcommerce} AWS_REGION=${region} \\
    bash scripts/cicd/codebuild-update-arm-environment.sh

Or manually:

  aws codebuild update-project \\
    --name "${project}" \\
    --region "${region}" \\
    --environment "type=${CODEBUILD_ARM_ENV_TYPE},image=${CODEBUILD_ARM_IMAGE},computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"

Then start a new build. Cross-build via QEMU on x86 is not supported in this repo.
EOF
}
