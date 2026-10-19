#!/usr/bin/env bash
# Uploads a release's config schema and definitions manifest schema, then its release.json, to the
# GitHub release of <tag>:
#   publish-release-assets.sh <tag> <release.json>
# release.json goes last and only after the schema uploads succeed, so a reader that finds it finds
# the schema it points to. --clobber replaces the assets of an earlier attempt.
set -euo pipefail

tag=$1
manifest=$2
schema=apps/server/config.schema.json
manifest_schema=modules/definitions/definitions-manifest.schema.json

asset=$(jq -r .configSchema.asset "$manifest")
if [[ $asset != "$(basename "$schema")" ]]; then
  echo "::error::release.json points to the asset $asset, but the release uploads $(basename "$schema")"
  exit 1
fi

gh release upload "$tag" "$schema" --clobber
gh release upload "$tag" "$manifest_schema" --clobber
gh release upload "$tag" "$manifest" --clobber
