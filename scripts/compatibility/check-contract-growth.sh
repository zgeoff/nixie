#!/usr/bin/env bash
# Fails when the contract's OpenAPI document breaks a client of the last release, unless the
# accepted-breaks file names that break:
#   check-contract-growth.sh <last-openapi.json> <openapi.json> <accepted-breaks.txt>
# A line accepts an error only when it ends with the error's method, its path and its whole message,
# exactly and in the same case, so a line accepts that one break and no other. The script matches
# the lines itself, because oasdiff's --err-ignore ignores case and would let `SELF_NOTE`
# through on a `self_note` line.
set -euo pipefail

specs=$(mktemp -d)
trap 'rm -rf "$specs"' EXIT

cp "$1" "$specs/last-openapi.json"
cp "$2" "$specs/openapi.json"
docker run --rm -v "$specs:/specs:ro" \
  tufin/oasdiff:v1.33.0@sha256:6263a96dd2ef0726c54e21fea9b8e1607eac4841add0079324b424c1f52b819c \
  breaking /specs/last-openapi.json /specs/openapi.json --format json > "$specs/breaks.json"

# oasdiff's level 3 is ERR; a warning never fails the check
jq -r --rawfile accepted "$3" '
  ($accepted | split("\n") | map(select(test("^\\s*(#|$)") | not))) as $lines
  | .[]
  | select(.level == 3)
  | (if .section == "components" then "components" else "\(.operation) \(.path)" end) as $where
  | "\($where) \(.text)" as $break
  | if any($lines[] | sub("\\s+$"; ""); . == $break or endswith(" \($break)"))
    then "accepted\t\($break)"
    else "error\t\($break)" end
' "$specs/breaks.json" > "$specs/verdicts.tsv"

while IFS=$'\t' read -r verdict break; do
  echo "$verdict: $break"
done < "$specs/verdicts.tsv"
if grep -q '^error' "$specs/verdicts.tsv"; then
  echo "::error::the contract breaks a client of the last release in a way no accepted-breaks line names"
  exit 1
fi
echo "the contract only grows, apart from the breaks it accepts"
