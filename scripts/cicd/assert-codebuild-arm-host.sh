#!/usr/bin/env bash
# Fail fast when CodeBuild is not on an ARM host (linux/arm64 images require ARM_CONTAINER).
set -euo pipefail

HOST_ARCH="$(uname -m)"
BUILD_IMAGE="${CODEBUILD_BUILD_IMAGE:-}"
PROJECT="${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME:-clientSideEcommerce}-build}"
REGION="${AWS_REGION:-ap-south-1}"

is_arm_host() {
  case "${HOST_ARCH}" in
    aarch64 | arm64) return 0 ;;
    *) return 1 ;;
  esac
}

is_arm_image() {
  [[ "${BUILD_IMAGE}" == *aarch64* || "${BUILD_IMAGE}" == *arm64* ]]
}

if is_arm_host || is_arm_image; then
  echo "assert-codebuild-arm-host: OK host_arch=${HOST_ARCH} build_image=${BUILD_IMAGE:-n/a}"
  exit 0
fi

echo "assert-codebuild-arm-host: FAILED"
echo "  host_arch=${HOST_ARCH} (expected aarch64/arm64)"
echo "  CODEBUILD_BUILD_IMAGE=${BUILD_IMAGE:-unset}"
echo ""
echo "This pipeline builds linux/arm64. Use a native ARM CodeBuild environment:"
echo ""
echo "  aws codebuild update-project \\"
echo "    --name \"${PROJECT}\" \\"
echo "    --region \"${REGION}\" \\"
echo "    --environment \"type=ARM_CONTAINER,image=aws/codebuild/amazonlinux2-aarch64-standard:3.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true\""
echo ""
echo "Then start a new build. Cross-build via QEMU (x86 host) is not supported in this repo."
exit 1
