#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"

echo "[after_install] Setting ownership to deploy user..."
chown -R deploy:deploy "${APP_DIR}"

echo "[after_install] Ensuring deploy user can run Docker..."
usermod -aG docker deploy || true

echo "[after_install] Done."
