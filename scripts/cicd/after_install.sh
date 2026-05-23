#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-log.sh
source "${SCRIPT_DIR}/lib/deploy-log.sh"
deploy_log_init "after_install"

APP_DIR="/home/deploy/yaadro/ecommerce_clientside_backend"

deploy_log "[after_install] Setting ownership to deploy user..."
chown -R deploy:deploy "${APP_DIR}"

deploy_log "[after_install] Ensuring deploy user can run Docker..."
usermod -aG docker deploy || true

deploy_log "[after_install] Done."
