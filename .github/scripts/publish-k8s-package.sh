#!/usr/bin/env bash
# Packs the Kubernetes component at a release's version and publishes it to npm with provenance:
#   publish-k8s-package.sh <version> [--dry-run]
# The workspace keeps the package at 0.0.0, so a release pull request bumps no version that
# bun.lock records; the script writes the version for the pack and restores package.json after.
# bun packs it, because npm would ship the catalog: protocol verbatim, and npm publishes it,
# because bun publish has no trusted publishing. A version already on npm is skipped, so a re-run
# of the release job passes. --dry-run packs and checks the tarball, and publishes nothing.
set -euo pipefail

version=$1
mode=${2:-}
package=deploy/pulumi-k8s
name=$(jq -r .name "$package/package.json")

work=$(mktemp -d)
cp "$package/package.json" "$work/package.json"
trap 'cp "$work/package.json" "$package/package.json"; rm -rf "$work"' EXIT

jq --arg version "$version" '.version = $version' "$work/package.json" > "$package/package.json"
(cd "$package" && bun pm pack --destination "$work" --quiet > /dev/null)
tarball=$(find "$work" -name '*.tgz')

packed=$(tar -xzOf "$tarball" package/package.json)
if [[ $(jq -r .version <<< "$packed") != "$version" ]]; then
  echo "::error::the packed $name holds version $(jq -r .version <<< "$packed"), not $version"
  exit 1
fi
if jq -e '[.. | strings | select(startswith("catalog:") or startswith("workspace:"))] | length > 0' \
  <<< "$packed" > /dev/null; then
  echo "::error::the packed $name still names a catalog: or workspace: version"
  exit 1
fi
if tar -tzf "$tarball" | grep -E '\.test\.ts$|/test-utils/'; then
  echo "::error::the packed $name holds the test files above"
  exit 1
fi

if [[ $mode == --dry-run ]]; then
  # npm refuses a prerelease version, such as a rehearsal's, without a tag
  npm publish "$tarball" --access public --tag rehearsal --dry-run
  exit 0
fi

if [[ $(npm view "$name@$version" version 2> /dev/null) == "$version" ]]; then
  echo "$name@$version is on npm already"
  exit 0
fi
npm publish "$tarball" --access public --provenance
