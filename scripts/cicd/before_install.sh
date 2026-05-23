#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"

install_pkg() {
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
  else
    apt-get update -y
    apt-get install -y "$@"
  fi
}

echo "[before_install] Ensuring deploy user/group exists..."
if ! id -u deploy >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/deploy --shell /bin/bash deploy
fi

echo "[before_install] Ensuring application directory exists..."
mkdir -p "${APP_DIR}"

echo "[before_install] Installing runtime dependencies if missing..."
if ! command -v aws >/dev/null 2>&1; then
  install_pkg awscli
fi

if ! command -v jq >/dev/null 2>&1; then
  install_pkg jq
fi

if ! command -v docker >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    install_pkg docker
  else
    install_pkg docker.io
  fi
fi

systemctl enable docker
systemctl start docker

# Amazon Linux 2023 typically provides Compose via `docker compose` from Docker CLI.
# Only install legacy docker-compose binary when neither variant is available.
if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "[before_install] docker compose not available; installing standalone docker-compose..."
  ARCH="$(uname -m)"
  if [[ "${ARCH}" == "x86_64" ]]; then
    COMPOSE_ARCH="x86_64"
  elif [[ "${ARCH}" == "aarch64" || "${ARCH}" == "arm64" ]]; then
    COMPOSE_ARCH="aarch64"
  else
    echo "[before_install] Unsupported architecture for docker-compose: ${ARCH}"
    exit 1
  fi

  COMPOSE_VERSION="v2.29.7"
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  docker-compose version
fi

echo "[before_install] Done."
