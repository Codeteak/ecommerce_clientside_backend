# CI/CD Pipeline (ARM, Minimal)

This project uses a simple ARM-native AWS pipeline:

- Source: GitHub/CodeStar connection
- Build: AWS CodeBuild (`buildspec.yml`)
- Deploy: AWS CodeDeploy (hooks from `appspec.yml`)

The Docker target is `linux/arm64`, so CodeBuild must run on ARM.

## File layout

- `buildspec.yml` - build/test/push pipeline definition
- `scripts/cicd/assert-codebuild-arm-host.sh` - fails fast if builder is not ARM
- `scripts/cicd/codebuild-env.sh` - exports `ACCOUNT_ID`, `ECR_URI`, `IMAGE_TAG`
- `scripts/cicd/docker-build-push.sh` - builds and pushes container image
- `scripts/cicd/codebuild-update-arm-environment.sh` - one-shot AWS update for ARM + logs
- `appspec.yml` + `scripts/cicd/{before_install,after_install,application_start,validate_service}.sh` - deploy hooks

## Required CodeBuild configuration

Set the build project environment to:

- `type=ARM_CONTAINER`
- `image=aws/codebuild/amazonlinux2-aarch64-standard:3.0`
- `privilegedMode=true`
- CloudWatch Logs enabled (recommended group: `/aws/codebuild/<project-name>`)

## One-time setup command

Run from repo root on a machine with AWS credentials:

```bash
AWS_REGION=ap-south-1 CODEBUILD_PROJECT_NAME="<your-build-project>" \
bash scripts/cicd/codebuild-update-arm-environment.sh
```

If your project is named `clientSideEcommerce-build`, `CODEBUILD_PROJECT_NAME` is optional.

## Build flow (`buildspec.yml`)

1. `install`: show runtime versions
2. `pre_build`: assert ARM host, prepare env vars, ECR login, install deps
3. `build`: run unit tests, build and push Docker image
4. `post_build`: emit `image-detail.json` artifact

## Common failure and fix

### Error

`PRE_BUILD` fails on `assert-codebuild-arm-host.sh`.

### Cause

CodeBuild project is x86 (`LINUX_CONTAINER`) while this repo builds `linux/arm64`.

### Fix

Run:

```bash
AWS_REGION=ap-south-1 CODEBUILD_PROJECT_NAME="<your-build-project>" \
bash scripts/cicd/codebuild-update-arm-environment.sh
```

Then trigger a new pipeline execution.

## Where to view logs

- Build logs: CodePipeline Build action -> open CodeBuild -> "View entire log"
- CloudWatch: `/aws/codebuild/<project-name>`
- Deploy logs: CodeDeploy deployment events + EC2 CodeDeploy agent logs

CodePipeline timeline itself does not show full live build logs inline.
