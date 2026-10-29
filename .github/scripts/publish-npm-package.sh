#!/usr/bin/env bash
# Builds and packs a workspace package at a release's version, and publishes it to npm with
# provenance:
#   publish-npm-package.sh <package dir> <version> [--dry-run]
# The release publishes the Kubernetes component in deploy/pulumi-k8s and the API contract in
# libs/contract. The workspace keeps each at 0.0.0 and exports its TypeScript source, so a release
# pull request bumps no version that bun.lock records. For the pack, the script writes the version,
# and swaps the exports for a JavaScript build and its declarations, because Node refuses TypeScript
# inside node_modules; it restores package.json after. bun packs it, because npm would ship the
# catalog: protocol verbatim, and npm publishes it, because bun publish has no trusted publishing.
# A version already on npm is skipped, so a re-run of the release job passes. A package npm does not
# hold yet is skipped with a warning, because npm sets up trusted publishing only on a package that
# exists. --dry-run packs, checks that Node imports the installed tarball and that a TypeScript
# program typechecks against it, and publishes nothing.
set -euo pipefail

package=$1
version=$2
mode=${3:-}
name=$(jq -r .name "$package/package.json")

work=$(mktemp -d)
cp "$package/package.json" "$work/package.json"
trap 'cp "$work/package.json" "$package/package.json"; rm -rf "$package/dist" "$work"' EXIT

(
  cd "$package"
  bun build src/index.ts --outdir dist --target node --format esm --packages external > /dev/null
  bunx tsrs -p tsconfig.build.json
  # node16 resolution needs an extension on each relative import, and the source writes none
  sed -i -E "s#(from '\./[a-z0-9-]+)'#\1.js'#" dist/*.d.ts
)
jq --arg version "$version" '.version = $version
  | .exports = { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } }
  | .files = ["README.md", "dist"]' "$work/package.json" > "$package/package.json"
(cd "$package" && bun pm pack --destination "$work" --quiet > /dev/null)
tarball=$(find "$work" -maxdepth 1 -name '*.tgz')

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

# each module the build imports must be a package the tarball declares, so the published entry
# reaches no workspace package and no runtime module, such as bun:sqlite or node:fs, that a client
# lacks
mkdir "$work/unpacked"
tar -xzf "$tarball" -C "$work/unpacked"
declared=$(jq -r '(.dependencies // {}) + (.peerDependencies // {}) | keys[]' <<< "$packed")
undeclared=$(grep -rhoE "(from |import\()['\"][^'\"./][^'\"]*['\"]" "$work/unpacked/package/dist" |
  sed -E "s#^(from |import\()['\"]##; s#['\"]\$##; s#^((@[^/]+/)?[^/]+).*#\1#" | sort -u |
  grep -vxF -f <(printf '%s\n' "$declared") || true)
if [[ -n $undeclared ]]; then
  echo "::error::the packed $name imports modules it does not declare as dependencies: ${undeclared//$'\n'/ }"
  exit 1
fi

if [[ $mode == --dry-run ]]; then
  consumer="$work/consumer"
  # the newest TypeScript that @pulumi/pulumi's peer range admits, which stops below 7
  consumer_typescript=6.0.3
  mkdir "$consumer"
  echo '{ "type": "module" }' > "$consumer/package.json"
  # the export that Node must find, the packages a consumer installs beside the tarball, and a
  # program that uses the package's types
  case $name in
    @heynixie/pulumi-k8s)
      entry=createNixie
      skip_lib_check=false
      companions=(
        "@pulumi/pulumi@$(jq -r '.devDependencies["@pulumi/pulumi"]' <<< "$packed")"
        "@pulumi/kubernetes@$(jq -r '.devDependencies["@pulumi/kubernetes"]' <<< "$packed")"
      )
      cat > "$consumer/main.ts" << EOF
import { createNixie } from '$name';
import type { NixieArgs } from '$name';
export const create = (args: NixieArgs) => createNixie('nixie', args).api.metadata.name;
EOF
      ;;
    @heynixie/contract)
      entry=contract
      # oRPC's declarations import its optional peer @opentelemetry/api, so a client that installs
      # no OpenTelemetry skips the check of declaration files, as the workspace does
      skip_lib_check=true
      companions=("@orpc/client@$(jq -r '.dependencies["@orpc/client"]' <<< "$packed")")
      # the expected error proves the client's type is the contract's, not any
      cat > "$consumer/main.ts" << EOF
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { contract } from '$name';
import type { ContractClient } from '$name';
const client: ContractClient = createORPCClient(new RPCLink({ url: 'https://nixie.example/rpc' }));
export const read: ContractClient['conversation']['read'] = client.conversation.read;
// @ts-expect-error the contract has no such route
export const missing = client.conversation.missing;
export const routes = Object.keys(contract);
EOF
      ;;
    *)
      echo "::error::the dry run has no consumer program for $name"
      exit 1
      ;;
  esac
  npm install --prefix "$consumer" --no-audit --no-fund --silent "$tarball" "${companions[@]}" \
    "typescript@$consumer_typescript"
  (cd "$consumer" && node --input-type=module -e "
    const module = await import('$name');
    if (module.$entry === undefined) throw new Error('$name exports no $entry');
    console.log('node imports $name, which exports ' + Object.keys(module).join(', '));
  ")

  # the strictest resolution a consumer can pick, so the declarations resolve under any of them
  echo "{ \"compilerOptions\": { \"module\": \"nodenext\", \"strict\": true, \"noEmit\": true,
    \"skipLibCheck\": $skip_lib_check }, \"files\": [\"main.ts\"] }" > "$consumer/tsconfig.json"
  (cd "$consumer" && npx tsc -p tsconfig.json)
  echo "TypeScript's nodenext resolution typechecks a program that imports $name"

  # npm refuses a prerelease version, such as a rehearsal's, without a tag
  npm publish "$tarball" --access public --tag rehearsal --dry-run
  exit 0
fi

if ! found=$(npm view "$name" name 2>&1); then
  if grep -q E404 <<< "$found"; then
    echo "::warning::npm holds no $name yet, so the release publishes nothing. Create the package on npm and add this workflow as its trusted publisher."
    exit 0
  fi
  echo "$found" >&2
  exit 1
fi
if [[ $(npm view "$name@$version" version 2> /dev/null) == "$version" ]]; then
  echo "$name@$version is on npm already"
  exit 0
fi
npm publish "$tarball" --access public --provenance
