#!/usr/bin/env bash
# Build and push the API image from CodeBuild (ARM64). Logs stream to CloudWatch via --progress=plain.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEBUILD_SRC_DIR="${CODEBUILD_SRC_DIR:-$(pwd)}"

on_err() {
  echo "docker-build-push: FAILED (exit $?) — check lines above for 'failed to solve', 'denied', or 'ECR_URI'"
}
trap on_err ERR

# Re-resolve in BUILD phase (exported-variables from pre_build are not always present).
# shellcheck source=scripts/cicd/codebuild-env.sh
. "${SCRIPT_DIR}/codebuild-env.sh"

DOCKERFILE="${CODEBUILD_SRC_DIR}/Dockerfile"
if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "docker-build-push: Dockerfile not found at ${DOCKERFILE}"
  exit 1
fi

BUILDER_NAME="${DOCKER_BUILDX_BUILDER:-clientside-builder}"
HOST_ARCH="$(uname -m)"
TARGET_PLATFORM="${DOCKER_PLATFORM:-linux/arm64}"

echo "docker-build-push: image=${ECR_URI}:${IMAGE_TAG}"
echo "docker-build-push: context=${CODEBUILD_SRC_DIR}"
echo "docker-build-push: host_arch=${HOST_ARCH} platform=${TARGET_PLATFORM}"

# x86 CodeBuild hosts need binfmt to build/push linux/arm64 images.
if [[ "${HOST_ARCH}" != "aarch64" && "${HOST_ARCH}" != "arm64" ]]; then
  echo "docker-build-push: installing QEMU binfmt handlers for cross-arch builds..."
  docker run --privileged --rm tonistiigi/binfmt --install all
fi

echo "docker-build-push: logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker buildx use "${BUILDER_NAME}" 2>/dev/null || \
  docker buildx create --name "${BUILDER_NAME}" --driver docker-container --use
docker buildx inspect --bootstrap

docker buildx build \
  --progress=plain \
  --platform "${TARGET_PLATFORM}" \
  --provenance=false \
  --sbom=false \
  --file "${DOCKERFILE}" \
  -t "${ECR_URI}:${IMAGE_TAG}" \
  --push \
  "${CODEBUILD_SRC_DIR}"

echo "docker-build-push: push succeeded"
