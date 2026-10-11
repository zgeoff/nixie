#!/usr/bin/env bash
# Writes the schema that a release's build knew, as the release's own run-schema-report.ts prints
# it and libs/db's run-migration-check.ts reads it with --released:
#   read-released-schema.sh <tag> <out.json>
# It installs the release's own tree in a temporary directory, because that schema lives in code.
set -euo pipefail

tag=$1
out=$(realpath "$2")
tree=$(mktemp -d)
trap 'rm -rf "$tree"' EXIT

git archive "$tag" | tar -x -C "$tree"
cd "$tree"
bun install --frozen-lockfile --ignore-scripts --filter @heynixie/db > /dev/null
bun libs/db/src/run-schema-report.ts > "$out"
