#!/usr/bin/env bash
# Source from buildspec phases: . scripts/cicd/codebuild-env.sh
# Sets ECR_URI / IMAGE_TAG for docker push (exported via buildspec exported-variables).

set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECR_REPOSITORY_NAME:?ECR_REPOSITORY_NAME is required}"

export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}"
export IMAGE_TAG="${CODEBUILD_RESOLVED_SOURCE_VERSION:-manual}-${CODEBUILD_BUILD_NUMBER}"
export IMAGE_TAG="$(echo "${IMAGE_TAG}" | tr '/' '-' | cut -c1-120)"

echo "codebuild-env: ACCOUNT_ID=${ACCOUNT_ID}"
echo "codebuild-env: ECR_URI=${ECR_URI}"
echo "codebuild-env: IMAGE_TAG=${IMAGE_TAG}"
