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

config=/app/preview/config.yaml
route=${NIXIE_PREVIEW_MODEL_ROUTE:-}

# The host's counting proxy serves this preview's route at the model API's own host, so the route
# only extends the profile's base URL. The health check runs this script every few seconds, so the
# copy lands whole through a rename.
if [ -n "$route" ]; then
  case "$route" in
    *[!a-z0-9-]* | -*)
      echo "NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not '$route'" >&2
      exit 1
      ;;
  esac

  config=/var/lib/nixie-preview/config.yaml
  sed "s#^      base_url: https://api.anthropic.com\$#      base_url: https://api.anthropic.com/$route#" \
    /app/preview/config.yaml > "$config.$$"
  if ! grep -q "base_url: https://api.anthropic.com/$route\$" "$config.$$"; then
    rm -f "$config.$$"
    echo "the preview config has no model base URL to put the route on" >&2
    exit 1
  fi
  mv "$config.$$" "$config"
fi

exec bun --define NIXIE_TEST_BUILD=true /app/apps/server/src/main.ts "$@" \
  --config "$config" --manifest /app/preview/sandbox-manifest.json \
  --sops /app/preview/run-plain-sops.sh --encoder /app/node_modules/.cache/nixie-encoder
