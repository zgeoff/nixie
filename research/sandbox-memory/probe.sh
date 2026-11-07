#!/usr/bin/env bash
# Runs one script from guest/ in a new test imp, prints its output, and removes the imp.
# Usage: probe.sh <image> <memory_mib> <vcpus> <guest_script> [args...]
# MODEL_SECRET names an impd secret for the model API. probe.sh grants it to the test imp alone,
# for the /v1/ paths, and impd revokes the grant when it removes the imp.
set -euo pipefail

image=$1 memory=$2 vcpus=$3 script=$4
shift 4
here=$(cd "$(dirname "$0")" && pwd)
name="memprobe-$memory-$$"

if impz ls | grep -q "^$name "; then
  echo "refusing: $name exists" >&2
  exit 1
fi

trap 'impz rm "$name" >/dev/null 2>&1 || true' EXIT

impz new --image "$image" --memory "$memory" --cpus "$vcpus" --policy public "$name" >/dev/null

require=()

if [ -n "${MODEL_SECRET:-}" ]; then
  impz grant --methods=POST,GET,HEAD --paths='/v1/**' "$name" "$MODEL_SECRET"
  require=(--require=broker)
fi

home=$(impz exec "$name" -- sh -c 'printf %s "$HOME"')
impz cp "$here/guest" "$name:$home/spike"
impz exec "${require[@]}" "$name" -- sh "$home/spike/$script" "$@"
