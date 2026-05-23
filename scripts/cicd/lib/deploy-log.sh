#!/usr/bin/env bash
# Shared logging for CodeDeploy hooks (stdout is captured in CodeDeploy → CodePipeline deploy logs).
DEPLOY_LOG="${DEPLOY_LOG:-/var/log/yaadro-ecom-deploy.log}"

deploy_log_init() {
  local hook="${1:-deploy}"
  mkdir -p "$(dirname "${DEPLOY_LOG}")"
  {
    echo ""
    echo "========== ${hook} $(date -u +%FT%TZ) =========="
  } | tee -a "${DEPLOY_LOG}"
}

deploy_log() {
  echo "$*" | tee -a "${DEPLOY_LOG}"
}
