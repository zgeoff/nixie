#!/usr/bin/env bash
# Runs publish-release-assets.sh against a stand-in for the GitHub CLI that records each call and
# keeps each uploaded file, so a pull request proves the release's uploads without a release:
#   check-publish-release-assets.sh <release.json>
# It checks the order and the files of a run that succeeds, and that a failed upload of either schema
# stops the run before release.json goes out.
set -euo pipefail

manifest=$(realpath "$1")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin"
cat > "$work/bin/gh" << 'STUB'
#!/usr/bin/env bash
# stands in for gh: records the call, fails an upload of FAIL_ON, and keeps each other upload
printf '%s\n' "$*" >> "$STUB_DIR/calls.log"
if [[ "$1 $2" == "release upload" ]]; then
  if [[ -n ${FAIL_ON:-} && $(basename "$4") == "$FAIL_ON" ]]; then
    echo "HTTP 502: upload of $4 failed" >&2
    exit 1
  fi
  cp "$4" "$STUB_DIR/uploaded/"
fi
STUB
chmod +x "$work/bin/gh"

# run_publish <case> [<file to fail>]: runs the publish script in its own stand-in directory
run_publish() {
  mkdir -p "$work/$1/uploaded"
  STUB_DIR="$work/$1" FAIL_ON="${2:-}" PATH="$work/bin:$PATH" \
    .github/scripts/publish-release-assets.sh v0.0.0-rehearsal "$manifest"
}

run_publish success
diff <(printf '%s\n' \
  'release upload v0.0.0-rehearsal apps/server/config.schema.json --clobber' \
  'release upload v0.0.0-rehearsal modules/definitions/definitions-manifest.schema.json --clobber' \
  "release upload v0.0.0-rehearsal $manifest --clobber") "$work/success/calls.log"
cmp apps/server/config.schema.json "$work/success/uploaded/config.schema.json"
cmp modules/definitions/definitions-manifest.schema.json \
  "$work/success/uploaded/definitions-manifest.schema.json"
cmp "$manifest" "$work/success/uploaded/$(basename "$manifest")"
echo "a run uploads config.schema.json and definitions-manifest.schema.json, then $(basename "$manifest")"

if run_publish failed config.schema.json 2> /dev/null; then
  echo "::error::the publish script succeeded although the schema upload failed"
  exit 1
fi
diff <(printf '%s\n' 'release upload v0.0.0-rehearsal apps/server/config.schema.json --clobber') \
  "$work/failed/calls.log"
echo "a failed schema upload stops the run before $(basename "$manifest") goes out"

if run_publish failed-manifest definitions-manifest.schema.json 2> /dev/null; then
  echo "::error::the publish script succeeded although the definitions manifest schema upload failed"
  exit 1
fi
diff <(printf '%s\n' \
  'release upload v0.0.0-rehearsal apps/server/config.schema.json --clobber' \
  'release upload v0.0.0-rehearsal modules/definitions/definitions-manifest.schema.json --clobber') \
  "$work/failed-manifest/calls.log"
echo "a failed definitions manifest schema upload stops the run before $(basename "$manifest") goes out"
