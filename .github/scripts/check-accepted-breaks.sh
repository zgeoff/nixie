#!/usr/bin/env bash
# Runs check-contract-growth.sh on two small documents, so a pull request proves that an accepted
# break passes and every other break still fails:
#   check-accepted-breaks.sh
# The new document adds two values to a response enum. A file that names one of them passes only
# when the other is absent, even when the other differs from it only in case. A line that names the
# break under the wrong method, or under a longer path that starts with the right one, fails.
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# write_document <file> <paths> <enum value>...: writes a document in which each of the
# comma-separated paths answers a POST with one response that holds those values
write_document() {
  local file=$1 paths=$2
  shift 2
  jq -n --arg paths "$paths" --args '{
    openapi: "3.1.1",
    info: { title: "rehearsal", version: "0.0.0" },
    paths: ($paths | split(",") | map({ key: ., value: { post: { responses: { "200": {
      description: "OK",
      content: { "application/json": { schema: {
        type: "object",
        properties: { reason: { type: "string", enum: $ARGS.positional } },
        required: ["reason"]
      } } }
    } } } } }) | from_entries)
  }' "$@" > "$file"
}

# accepts <case> <new document> [<last document>]: runs the check against the case's
# accepted-breaks file
accepts() {
  .github/scripts/check-contract-growth.sh "${3:-$work/last.json}" "$2" "$work/$1.txt" > /dev/null
}

# entry <method> <path> <enum value>: prints the line that accepts that value under that endpoint
# shellcheck disable=SC2016 # the backticks are oasdiff's quotes, not an expansion
entry() {
  printf '%s %s added the new `%s` enum value to the `reason` response property for the response status `200`\n' "$1" "$2" "$3"
}

proposals=/memory/listProposals
both=$proposals,${proposals}Archive
write_document "$work/last.json" "$proposals" no_quote
write_document "$work/one.json" "$proposals" no_quote self_note
write_document "$work/two.json" "$proposals" no_quote self_note other_reason
write_document "$work/cased.json" "$proposals" no_quote self_note SELF_NOTE
write_document "$work/last-both.json" "$both" no_quote
write_document "$work/one-both.json" "$both" no_quote self_note
{
  echo '# accepted breaks for the rehearsal'
  entry 'GEO-0: POST' "$proposals" self_note
} > "$work/listed.txt"
entry GET "$proposals" self_note > "$work/wrong-method.txt"
entry POST "${proposals}Archive" self_note > "$work/longer-path.txt"
: > "$work/empty.txt"

if accepts empty "$work/one.json"; then
  echo "::error::the check passed a new response enum value that no line accepts"
  exit 1
fi
echo "a new response enum value fails the check"

accepts listed "$work/one.json"
echo "a line that names the break lets it pass"

if accepts listed "$work/two.json"; then
  echo "::error::the check passed a second enum value beside the accepted one"
  exit 1
fi
echo "a break beside the accepted one still fails"

if accepts listed "$work/cased.json"; then
  echo "::error::the check passed an enum value that differs from the accepted one only in case"
  exit 1
fi
echo "a break that differs from the accepted one only in case still fails"

if accepts wrong-method "$work/one.json"; then
  echo "::error::the check passed a break that a line names under another method"
  exit 1
fi
echo "a line that names the break under another method accepts nothing"

if accepts longer-path "$work/one-both.json" "$work/last-both.json"; then
  echo "::error::the check passed a break that a line names only under a longer path"
  exit 1
fi
echo "a line that names the break under a longer path accepts nothing at the shorter one"
