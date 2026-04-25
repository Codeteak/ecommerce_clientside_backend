#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Production bootstrap script for ECR + CodeBuild + CodeDeploy deployment flow.
# Run this from an operator machine with AWS CLI v2 and jq installed.
#
# This script is idempotent for ECR and can be used as a source-of-truth checklist
# for the remaining resources in your current account.
# -----------------------------------------------------------------------------

AWS_REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

PROJECT_NAME="${PROJECT_NAME:-clientSideEcommerce}"
ECR_REPOSITORY_NAME="${ECR_REPOSITORY_NAME:-clientside-ecommerce-api}"
CODEDEPLOY_APP_NAME="${CODEDEPLOY_APP_NAME:-clientSide-codedeploy-app}"
CODEDEPLOY_DEPLOYMENT_GROUP="${CODEDEPLOY_DEPLOYMENT_GROUP:-clientSide-codedeploy-dg}"
ASG_NAME="${ASG_NAME:-clientSide-asg}"
SERVICE_ROLE_ARN="${SERVICE_ROLE_ARN:-}"
CODEBUILD_SERVICE_ROLE_ARN="${CODEBUILD_SERVICE_ROLE_ARN:-}"
S3_ARTIFACT_BUCKET="${S3_ARTIFACT_BUCKET:-}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"

echo "==> Region: ${AWS_REGION}"
echo "==> Account: ${ACCOUNT_ID}"
echo "==> Project: ${PROJECT_NAME}"

if [[ -z "${SERVICE_ROLE_ARN}" ]]; then
  echo "ERROR: SERVICE_ROLE_ARN is required (CodeDeploy service role ARN)."
  exit 1
fi

if [[ -z "${CODEBUILD_SERVICE_ROLE_ARN}" ]]; then
  echo "ERROR: CODEBUILD_SERVICE_ROLE_ARN is required."
  exit 1
fi

if [[ -z "${S3_ARTIFACT_BUCKET}" ]]; then
  echo "ERROR: S3_ARTIFACT_BUCKET is required."
  exit 1
fi

if [[ -z "${GITHUB_REPOSITORY}" ]]; then
  echo "ERROR: GITHUB_REPOSITORY is required, for example org/repo."
  exit 1
fi

echo "==> Ensuring ECR repository exists..."
if ! aws ecr describe-repositories \
  --repository-names "${ECR_REPOSITORY_NAME}" \
  --region "${AWS_REGION}" >/dev/null 2>&1; then
  aws ecr create-repository \
    --repository-name "${ECR_REPOSITORY_NAME}" \
    --image-tag-mutability MUTABLE \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --region "${AWS_REGION}" >/dev/null
  echo "Created ECR repository ${ECR_REPOSITORY_NAME}"
else
  echo "ECR repository ${ECR_REPOSITORY_NAME} already exists"
fi

cat <<EOF

ECR repository URI:
  ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}

Next actions (run manually once values are verified):

1) Create/verify CodeDeploy application:
   aws deploy create-application \\
     --application-name "${CODEDEPLOY_APP_NAME}" \\
     --compute-platform Server \\
     --region "${AWS_REGION}"

2) Create/verify deployment group attached to ASG:
   aws deploy create-deployment-group \\
     --application-name "${CODEDEPLOY_APP_NAME}" \\
     --deployment-group-name "${CODEDEPLOY_DEPLOYMENT_GROUP}" \\
     --service-role-arn "${SERVICE_ROLE_ARN}" \\
     --auto-scaling-groups "${ASG_NAME}" \\
     --deployment-config-name CodeDeployDefault.AllAtOnce \\
     --region "${AWS_REGION}"

3) Create/verify CodeBuild project:
   aws codebuild create-project \\
     --name "${PROJECT_NAME}-build" \\
     --service-role "${CODEBUILD_SERVICE_ROLE_ARN}" \\
     --artifacts type=CODEPIPELINE \\
     --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_MEDIUM,privilegedMode=true \\
     --source type=CODEPIPELINE \\
     --region "${AWS_REGION}"

4) Create CodePipeline stages:
   - Source: GitHub/CodeStar connection
   - Build: CodeBuild project "${PROJECT_NAME}-build"
   - Deploy: CodeDeploy app "${CODEDEPLOY_APP_NAME}" + group "${CODEDEPLOY_DEPLOYMENT_GROUP}"
   - Artifact store: s3://${S3_ARTIFACT_BUCKET}

5) Ensure EC2 instance profile permissions include:
   - AmazonEC2ContainerRegistryReadOnly
   - SecretsManagerReadWrite (or scoped secret read)
   - CloudWatchAgentServerPolicy (recommended)
   - AWSCodeDeployFullAccess (or least-privileged equivalent for agent operations)

6) Ensure CodeBuild service role permissions include:
   - ecr:GetAuthorizationToken
   - ecr:BatchCheckLayerAvailability
   - ecr:CompleteLayerUpload
   - ecr:InitiateLayerUpload
   - ecr:PutImage
   - ecr:UploadLayerPart
   - logs:CreateLogGroup/CreateLogStream/PutLogEvents
   - s3:GetObject/PutObject on artifact bucket
   - codestar-connections:UseConnection (if using CodeStar source)

7) Ensure ALB target group health check:
   - Protocol: HTTP
   - Port: traffic port (4100)
   - Path: /health
   - Success codes: 200
   - Timeout/interval should allow cold starts

EOF
