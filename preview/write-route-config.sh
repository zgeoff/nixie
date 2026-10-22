#!/bin/sh
# Writes a copy of the preview config whose model base URL ends in a host's model route:
#   write-route-config.sh <route> <source config> <target config>
# The host's counting proxy serves the route at the model API's own host, so the route only extends
# the profile's base URL. The health check reruns the entrypoint every few seconds, so the copy
# lands whole through a rename.
set -eu

route=$1
source=$2
target=$3

case "$route" in
  '' | *[!a-z0-9-]* | -*)
    echo "NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not '$route'" >&2
    exit 1
    ;;
esac

sed "s#^      base_url: https://api.anthropic.com\$#      base_url: https://api.anthropic.com/$route#" \
  "$source" > "$target.$$"
if ! grep -q "base_url: https://api.anthropic.com/$route\$" "$target.$$"; then
  rm -f "$target.$$"
  echo "the preview config has no model base URL to put the route on" >&2
  exit 1
fi
mv "$target.$$" "$target"
