#!/bin/sh
# Runs one nixie command in a test build of the source. The first start writes a secrets file with
# a throwaway deployment key, which only this preview ever holds. Its one model credential is a
# placeholder, because the host's credential broker adds the real one on the way out.
set -eu

secrets=/var/lib/nixie-preview/secrets.yaml

if [ ! -f "$secrets" ]; then
  umask 077
  key=$(head -c 32 /dev/urandom | base64)
  printf 'deployment_key: %s\nmodel_credentials:\n  broker: held-by-the-broker\n' "$key" > "$secrets"
fi

exec bun --define NIXIE_TEST_BUILD=true /app/apps/server/src/main.ts "$@" \
  --config /app/preview/config.yaml --manifest /app/preview/sandbox-manifest.json \
  --sops /app/preview/run-plain-sops.sh --encoder /app/node_modules/.cache/nixie-encoder
