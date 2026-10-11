#!/usr/bin/env bash
# Pulls each image with no registry credentials, as impd does, and fails when any image does not
# pull, which on GHCR means its package is still private:
#   check-public-pulls.sh <repository>@sha256:<digest>...
set -euo pipefail

DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
failed=0

for ref in "$@"; do
  if docker pull --quiet --platform linux/amd64 "$ref"; then
    echo "pulled $ref with no credentials"
  else
    echo "::error::$ref does not pull with no credentials. Set the package public in its package settings, then re-run the failed jobs."
    failed=1
  fi
done
exit "$failed"
