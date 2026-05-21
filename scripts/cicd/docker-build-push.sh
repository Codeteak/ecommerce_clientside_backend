#!/usr/bin/env bash
# Build and push the API image from CodeBuild. ARM hosts use plain docker build; x86 uses buildx + QEMU.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEBUILD_SRC_DIR="${CODEBUILD_SRC_DIR:-$(pwd)}"

on_err() {
  echo "docker-build-push: FAILED (exit $?) — check lines above for 'failed to solve', 'denied', '125', or invalid ECR_URI"
  docker buildx ls 2>/dev/null || true
  docker ps -a 2>/dev/null | head -20 || true
}
trap on_err ERR

# shellcheck source=scripts/cicd/codebuild-env.sh
. "${SCRIPT_DIR}/codebuild-env.sh"

: "${AWS_REGION:?AWS_REGION is required}"
: "${ACCOUNT_ID:?ACCOUNT_ID is required}"
: "${ECR_URI:?ECR_URI is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

DOCKERFILE="${CODEBUILD_SRC_DIR}/Dockerfile"
if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "docker-build-push: Dockerfile not found at ${DOCKERFILE}"
  exit 1
fi

BUILDER_NAME="${DOCKER_BUILDX_BUILDER:-clientside-builder}"
HOST_ARCH="$(uname -m)"
TARGET_PLATFORM="${DOCKER_PLATFORM:-linux/arm64}"
NATIVE_ARM=false
if [[ "${HOST_ARCH}" == "aarch64" || "${HOST_ARCH}" == "arm64" ]]; then
  NATIVE_ARM=true
fi

echo "docker-build-push: image=${ECR_URI}:${IMAGE_TAG}"
echo "docker-build-push: context=${CODEBUILD_SRC_DIR}"
echo "docker-build-push: host_arch=${HOST_ARCH} platform=${TARGET_PLATFORM} native_arm=${NATIVE_ARM}"

echo "docker-build-push: logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# CodeBuild ARM (amazonlinux2-aarch64-standard): avoid buildx docker-container driver (often exits 125).
if [[ "${NATIVE_ARM}" == "true" && "${TARGET_PLATFORM}" == "linux/arm64" ]]; then
  echo "docker-build-push: native linux/arm64 build (docker build + push)..."
  export DOCKER_BUILDKIT=1
  docker build \
    --progress=plain \
    -f "${DOCKERFILE}" \
    -t "${ECR_URI}:${IMAGE_TAG}" \
    "${CODEBUILD_SRC_DIR}"
  docker push "${ECR_URI}:${IMAGE_TAG}"
else
  echo "docker-build-push: cross-platform build via buildx..."
  if [[ "${NATIVE_ARM}" != "true" ]]; then
    echo "docker-build-push: installing QEMU binfmt handlers for cross-arch builds..."
    if ! docker run --privileged --rm tonistiigi/binfmt --install all; then
      echo "docker-build-push: binfmt install failed — ensure CodeBuild privilegedMode=true"
      exit 125
    fi
  fi

  docker buildx rm "${BUILDER_NAME}" 2>/dev/null || true
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
fi

echo "docker-build-push: push succeeded"
