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

if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    install_pkg docker-compose-plugin
  else
    install_pkg docker-compose-plugin
  fi
fi

systemctl enable docker
systemctl start docker

echo "[before_install] Done."
