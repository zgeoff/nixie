#!/usr/bin/env bash
# Builds and packs the Kubernetes component at a release's version, and publishes it to npm with
# provenance:
#   publish-k8s-package.sh <version> [--dry-run]
# The workspace keeps the package at 0.0.0 and exports its TypeScript source, so a release pull
# request bumps no version that bun.lock records. For the pack, the script writes the version, and
# swaps the exports for a JavaScript build and its declarations, because Node refuses TypeScript
# inside node_modules; it restores package.json after. bun packs it, because npm would ship the
# catalog: protocol verbatim, and npm publishes it, because bun publish has no trusted publishing.
# A version already on npm is skipped, so a re-run of the release job passes. --dry-run packs,
# checks that Node imports the installed tarball, and publishes nothing.
set -euo pipefail

version=$1
mode=${2:-}
package=deploy/pulumi-k8s
name=$(jq -r .name "$package/package.json")

work=$(mktemp -d)
cp "$package/package.json" "$work/package.json"
trap 'cp "$work/package.json" "$package/package.json"; rm -rf "$package/dist" "$work"' EXIT

(
  cd "$package"
  bun build src/index.ts --outdir dist --target node --format esm --packages external > /dev/null
  bunx tsrs -p tsconfig.build.json
)
jq --arg version "$version" '.version = $version
  | .exports = { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } }
  | .files = ["README.md", "dist"]' "$work/package.json" > "$package/package.json"
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
if tar -tzf "$tarball" | grep -E '\.ts$' | grep -vE '\.d\.ts$'; then
  echo "::error::the packed $name holds the TypeScript source above"
  exit 1
fi

if [[ $mode == --dry-run ]]; then
  consumer="$work/consumer"
  mkdir "$consumer"
  echo '{ "type": "module" }' > "$consumer/package.json"
  npm install --prefix "$consumer" --no-audit --no-fund --silent "$tarball" \
    "@pulumi/pulumi@$(jq -r '.devDependencies["@pulumi/pulumi"]' <<< "$packed")" \
    "@pulumi/kubernetes@$(jq -r '.devDependencies["@pulumi/kubernetes"]' <<< "$packed")"
  (cd "$consumer" && node --input-type=module -e "
    const component = await import('$name');
    if (typeof component.createNixie !== 'function') throw new Error('$name exports no createNixie');
    console.log('node imports $name, which exports ' + Object.keys(component).join(', '));
  ")

  # npm refuses a prerelease version, such as a rehearsal's, without a tag
  npm publish "$tarball" --access public --tag rehearsal --dry-run
  exit 0
fi

if [[ $(npm view "$name@$version" version 2> /dev/null) == "$version" ]]; then
  echo "$name@$version is on npm already"
  exit 0
fi
npm publish "$tarball" --access public --provenance
