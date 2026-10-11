#!/usr/bin/env bash
# Writes the schema that a release's build knew, each migration name in order and its oldest
# reader, in the form libs/db's run-migration-check.ts reads with --released:
#   read-released-schema.sh <tag> <out.json>
# It installs the release's own tree in a temporary directory, because the names live in code.
set -euo pipefail

tag=$1
out=$(realpath "$2")
tree=$(mktemp -d)
trap 'rm -rf "$tree"' EXIT

git archive "$tag" | tar -x -C "$tree"
cd "$tree"
bun install --frozen-lockfile --ignore-scripts --filter @heynixie/db > /dev/null
bun -e '
  import { nixieSchema } from "./libs/db/src/nixie-schema.ts";
  const migrations = nixieSchema.migrations.map((migration) => migration.name);
  console.log(JSON.stringify({ migrations, oldestReader: nixieSchema.oldestReader }));
' > "$out"
