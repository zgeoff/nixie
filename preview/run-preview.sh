#!/bin/sh
# Runs one nixie command in a test build of the source. The first start writes a secrets file with
# a throwaway deployment key, which only this preview ever holds. Its one model credential is a
# placeholder, because the host's credential broker adds the real one on the way out.
set -eu

# empty in the image; a test runs the script under a temporary root
root=${NIXIE_PREVIEW_ROOT:-}
state=$root/var/lib/nixie-preview
app=$root/app

secrets=$state/secrets.yaml

if [ ! -f "$secrets" ]; then
  umask 077
  key=$(head -c 32 /dev/urandom | base64)
  printf 'deployment_key: %s\nmodel_credentials:\n  broker: held-by-the-broker\n' "$key" > "$secrets"
fi

config=$app/preview/config.yaml

if [ -n "${NIXIE_PREVIEW_MODEL_ROUTE:-}" ]; then
  config=$state/config.yaml
  bun --define NIXIE_TEST_BUILD=true "$app/apps/server/src/run-preview-route-config.ts" \
    --route "$NIXIE_PREVIEW_MODEL_ROUTE" --source "$app/preview/config.yaml" --target "$config"
fi

exec bun --define NIXIE_TEST_BUILD=true "$app/apps/server/src/main.ts" "$@" \
  --config "$config" --manifest "$app/preview/sandbox-manifest.json" \
  --sops "$app/preview/run-plain-sops.sh" --encoder "$app/node_modules/.cache/nixie-encoder"
