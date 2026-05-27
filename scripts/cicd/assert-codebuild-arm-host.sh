#!/usr/bin/env bash
# Deprecated alias — use ensure-codebuild-arm-host.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ensure-codebuild-arm-host.sh" "$@"
