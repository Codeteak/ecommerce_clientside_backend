#!/usr/bin/env bash
# One-shot fix: point CodeBuild at a native ARM builder (linux/arm64 images).
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
PROJECT_NAME="${PROJECT_NAME:-clientSideEcommerce}"
CODEBUILD_PROJECT="${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME}-build}"

echo "Updating CodeBuild project ${CODEBUILD_PROJECT} (${AWS_REGION}) to ARM_CONTAINER..."
aws codebuild update-project \
  --name "${CODEBUILD_PROJECT}" \
  --region "${AWS_REGION}" \
  --environment "type=ARM_CONTAINER,image=aws/codebuild/amazonlinux2-aarch64-standard:3.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"

echo "Done. Start a new pipeline/build; confirm logs show: host_arch=aarch64 native_arm=true"
