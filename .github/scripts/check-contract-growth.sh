#!/usr/bin/env bash
# Fails when the contract's OpenAPI document breaks a client of the last release, unless the
# accepted-breaks file names that break:
#   check-contract-growth.sh <last-openapi.json> <openapi.json> <accepted-breaks.txt>
# oasdiff accepts an error only when one line of the file holds its method, its path and its whole
# message, so a line accepts that one break and no other.
set -euo pipefail

specs=$(mktemp -d)
trap 'rm -rf "$specs"' EXIT

cp "$1" "$specs/last-openapi.json"
cp "$2" "$specs/openapi.json"
cp "$3" "$specs/accepted-breaks.txt"
docker run --rm -v "$specs:/specs:ro" \
  tufin/oasdiff:v1.33.0@sha256:6263a96dd2ef0726c54e21fea9b8e1607eac4841add0079324b424c1f52b819c \
  breaking /specs/last-openapi.json /specs/openapi.json --fail-on ERR \
  --err-ignore /specs/accepted-breaks.txt
