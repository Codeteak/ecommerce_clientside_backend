#!/usr/bin/env bash
# Build and push the API image from CodeBuild (ARM64). Logs stream to CloudWatch via --progress=plain.

set -euo pipefail

: "${CODEBUILD_SRC_DIR:?CODEBUILD_SRC_DIR is required}"
: "${ECR_URI:?ECR_URI is required — source scripts/cicd/codebuild-env.sh in this phase}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

BUILDER_NAME="${DOCKER_BUILDX_BUILDER:-clientside-builder}"

echo "docker-build-push: image=${ECR_URI}:${IMAGE_TAG}"
echo "docker-build-push: context=${CODEBUILD_SRC_DIR}"

docker buildx use "${BUILDER_NAME}" 2>/dev/null || docker buildx create --name "${BUILDER_NAME}" --use
docker buildx inspect --bootstrap

docker buildx build \
  --progress=plain \
  --platform linux/arm64 \
  --provenance=false \
  --sbom=false \
  --file "${CODEBUILD_SRC_DIR}/Dockerfile" \
  -t "${ECR_URI}:${IMAGE_TAG}" \
  --push \
  "${CODEBUILD_SRC_DIR}"

echo "docker-build-push: push succeeded"
