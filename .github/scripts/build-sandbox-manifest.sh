#!/usr/bin/env bash
# Prints the sandbox manifest that the nixie image carries, mapping each sandbox kind to its image
# by digest, as apps/server's loadSandboxManifest reads it:
#   build-sandbox-manifest.sh <conversation ref> <fetch ref>
# Each ref is <repository>@sha256:<digest>.
set -euo pipefail

jq -cn --arg conversation "$1" --arg fetch "$2" '{conversation: $conversation, fetch: $fetch}'
