#!/usr/bin/env bash
# Build and push the API image from CodeBuild. ARM hosts use plain docker build; x86 uses buildx + QEMU.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEBUILD_SRC_DIR="${CODEBUILD_SRC_DIR:-$(pwd)}"
# shellcheck source=scripts/cicd/lib/arm-environment.sh
. "${SCRIPT_DIR}/lib/arm-environment.sh"

on_err() {
  local code=$?
  echo "docker-build-push: FAILED (exit ${code})"
  echo "docker-build-push: common causes:"
  echo "  - CodeBuild project not ARM_CONTAINER + privilegedMode=true (x86 → binfmt exit 125)"
  echo "  - ECR login denied or invalid ECR_URI / IMAGE_TAG"
  echo "  - docker build OOM or Dockerfile npm ci failure (see lines above)"
  docker buildx ls 2>/dev/null || true
  docker images 2>/dev/null | head -15 || true
  exit "${code}"
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
HOST_ARCH="$(arm_detect_host_arch)"
TARGET_PLATFORM="${DOCKER_PLATFORM:-linux/arm64}"
NATIVE_ARM=false
if arm_is_arm_build_environment; then
  NATIVE_ARM=true
fi

echo "docker-build-push: image=${ECR_URI}:${IMAGE_TAG}"
echo "docker-build-push: context=${CODEBUILD_SRC_DIR}"
echo "docker-build-push: host_arch=${HOST_ARCH} platform=${TARGET_PLATFORM} native_arm=${NATIVE_ARM}"
echo "docker-build-push: codebuild_image=${CODEBUILD_BUILD_IMAGE:-unknown}"

if [[ "${NATIVE_ARM}" != "true" && "${TARGET_PLATFORM}" == "linux/arm64" ]]; then
  echo "docker-build-push: ERROR: cannot build ${TARGET_PLATFORM} on host ${HOST_ARCH}."
  arm_print_fix_instructions
  exit 1
fi

echo "docker-build-push: logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

native_docker_build() {
  local use_buildkit="${1:-1}"
  if [[ "${use_buildkit}" == "1" ]]; then
    export DOCKER_BUILDKIT=1
  else
    unset DOCKER_BUILDKIT || true
    export DOCKER_BUILDKIT=0
  fi
  docker build \
    --progress=plain \
    --platform "${TARGET_PLATFORM}" \
    -f "${DOCKERFILE}" \
    -t "${ECR_URI}:${IMAGE_TAG}" \
    -t "${ECR_URI}:latest" \
    "${CODEBUILD_SRC_DIR}"
}

# CodeBuild ARM (amazonlinux2-aarch64-standard): avoid buildx docker-container driver (often exits 125).
if [[ "${NATIVE_ARM}" == "true" && "${TARGET_PLATFORM}" == "linux/arm64" ]]; then
  echo "docker-build-push: native linux/arm64 build (docker build + push)..."
  if ! native_docker_build 1; then
    echo "docker-build-push: BuildKit build failed; retrying with legacy builder..."
    native_docker_build 0
  fi
  docker push "${ECR_URI}:${IMAGE_TAG}"
  if ! docker push "${ECR_URI}:latest" 2>/dev/null; then
    echo "docker-build-push: latest tag push skipped (ECR tag immutability or policy)"
  fi
else
  echo "docker-build-push: cross-platform build via buildx (host=${HOST_ARCH} platform=${TARGET_PLATFORM})..."
  echo "docker-build-push: installing QEMU binfmt handlers..."
  if ! docker run --privileged --rm tonistiigi/binfmt --install all; then
    echo "docker-build-push: ERROR: binfmt install failed (privilegedMode=true required on x86)."
    exit 1
  fi

  docker buildx rm "${BUILDER_NAME}" 2>/dev/null || true
  if ! docker buildx create --name "${BUILDER_NAME}" --driver docker-container --use; then
    echo "docker-build-push: ERROR: buildx create failed (privilegedMode=true required)."
    exit 1
  fi
  docker buildx inspect --bootstrap

  docker buildx build \
    --progress=plain \
    --platform "${TARGET_PLATFORM}" \
    --provenance=false \
    --sbom=false \
    --file "${DOCKERFILE}" \
    -t "${ECR_URI}:${IMAGE_TAG}" \
    -t "${ECR_URI}:latest" \
    --push \
    "${CODEBUILD_SRC_DIR}"
fi

echo "docker-build-push: push succeeded (${ECR_URI}:${IMAGE_TAG})"
