#!/usr/bin/env bash
# Shared CodeBuild project settings: ARM_CONTAINER + CloudWatch Logs.
# shellcheck shell=bash

codebuild_resolve_project_name() {
  echo "${CODEBUILD_PROJECT_NAME:-${PROJECT_NAME:-clientSideEcommerce}-build}"
}

codebuild_logs_config() {
  local project="$1"
  echo "cloudWatchLogs={status=ENABLED,groupName=/aws/codebuild/${project}},s3Logs={status=DISABLED}"
}

# Apply ARM + logs if needed. Prints status to stdout.
# Exit: 0 = already OK or update succeeded, 1 = project missing, 2 = update failed
codebuild_apply_arm_and_logs() {
  local region="${1:-${AWS_REGION:-ap-south-1}}"
  local project
  project="$(codebuild_resolve_project_name)"
  local log_group="/aws/codebuild/${project}"
  local arm_env="type=${CODEBUILD_ARM_ENV_TYPE},image=${CODEBUILD_ARM_IMAGE},computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true"
  local logs_config
  logs_config="$(codebuild_logs_config "${project}")"

  if ! command -v aws >/dev/null 2>&1; then
    echo "codebuild-config: aws CLI not available"
    return 2
  fi

  local count
  count="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'length(projects)' --output text 2>/dev/null || echo 0)"
  if [[ "${count}" != "1" ]]; then
    echo "codebuild-config: project not found: ${project} (region ${region})"
    return 1
  fi

  local current_type current_image current_priv current_log_status current_log_group
  current_type="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'projects[0].environment.type' --output text)"
  current_image="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'projects[0].environment.image' --output text)"
  current_priv="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'projects[0].environment.privilegedMode' --output text)"
  current_log_status="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'projects[0].logsConfig.cloudWatchLogs.status' --output text)"
  current_log_group="$(aws codebuild batch-get-projects --names "${project}" --region "${region}" \
    --query 'projects[0].logsConfig.cloudWatchLogs.groupName' --output text)"

  echo "codebuild-config: project=${project}"
  echo "codebuild-config: type=${current_type} image=${current_image} privilegedMode=${current_priv}"
  echo "codebuild-config: cloudWatchLogs=${current_log_status} group=${current_log_group:-n/a}"

  local need_arm=false need_logs=false
  if [[ "${current_type}" != "${CODEBUILD_ARM_ENV_TYPE}" || "${current_image}" != "${CODEBUILD_ARM_IMAGE}" || "${current_priv}" != "True" ]]; then
    need_arm=true
  fi
  if [[ "${current_log_status}" != "ENABLED" || "${current_log_group}" != "${log_group}" ]]; then
    need_logs=true
  fi

  if [[ "${need_arm}" == "false" && "${need_logs}" == "false" ]]; then
    echo "codebuild-config: project already ARM + CloudWatch Logs"
    return 0
  fi

  if [[ "${need_arm}" == "true" && "${need_logs}" == "true" ]]; then
    echo "codebuild-config: updating ARM environment and CloudWatch Logs..."
    if ! aws codebuild update-project \
      --name "${project}" \
      --region "${region}" \
      --environment "${arm_env}" \
      --logs-config "${logs_config}"; then
      return 2
    fi
  elif [[ "${need_arm}" == "true" ]]; then
    echo "codebuild-config: updating ARM environment..."
    if ! aws codebuild update-project \
      --name "${project}" \
      --region "${region}" \
      --environment "${arm_env}" \
      --logs-config "${logs_config}"; then
      return 2
    fi
  else
    echo "codebuild-config: enabling CloudWatch Logs..."
    if ! aws codebuild update-project \
      --name "${project}" \
      --region "${region}" \
      --logs-config "${logs_config}"; then
      return 2
    fi
  fi

  echo "codebuild-config: update succeeded"
  return 0
}
