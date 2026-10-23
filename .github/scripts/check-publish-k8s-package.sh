#!/usr/bin/env bash
# Runs publish-k8s-package.sh on its release path against a stand-in for npm that records each call
# and keeps each published tarball, so a pull request proves the release's publish without npm:
#   check-publish-k8s-package.sh
# It checks that a version npm holds already publishes nothing, that an absent version publishes
# the packed tarball with provenance, and that each run leaves package.json as it was.
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin"
cat > "$work/bin/npm" << 'STUB'
#!/usr/bin/env bash
# stands in for npm: answers a view with PUBLISHED, as npm answers a version it holds, fails a view
# of any other version with npm's 404, and keeps each published tarball
if [[ $1 == view ]]; then
  printf 'view %s\n' "${*:2}" >> "$STUB_DIR/calls.log"
  if [[ -n ${PUBLISHED:-} && $2 == *"@$PUBLISHED" ]]; then
    echo "$PUBLISHED"
    exit 0
  fi
  echo "npm error code E404" >&2
  exit 1
fi
if [[ $1 == publish ]]; then
  printf 'publish %s %s\n' "$(basename "$2")" "${*:3}" >> "$STUB_DIR/calls.log"
  cp "$2" "$STUB_DIR/published/"
  exit 0
fi
echo "the npm stand-in has no answer for: $*" >&2
exit 1
STUB
chmod +x "$work/bin/npm"

# run_publish <case> [<version npm holds>]: runs the release path in its own stand-in directory
run_publish() {
  mkdir -p "$work/$1/published"
  STUB_DIR="$work/$1" PUBLISHED="${2:-}" PATH="$work/bin:$PATH" \
    .github/scripts/publish-k8s-package.sh 1.2.3 > "$work/$1/out.log"
  git diff --quiet -- deploy/pulumi-k8s/package.json
}

run_publish published 1.2.3
diff <(printf '%s\n' 'view @heynixie/pulumi-k8s@1.2.3 version') "$work/published/calls.log"
grep -qx '@heynixie/pulumi-k8s@1.2.3 is on npm already' "$work/published/out.log"
[[ -z $(ls -A "$work/published/published") ]]

run_publish absent
diff <(printf '%s\n' \
  'view @heynixie/pulumi-k8s@1.2.3 version' \
  'publish heynixie-pulumi-k8s-1.2.3.tgz --access public --provenance') "$work/absent/calls.log"
[[ $(tar -xzOf "$work/absent/published/heynixie-pulumi-k8s-1.2.3.tgz" package/package.json \
  | jq -r .version) == 1.2.3 ]]

echo "the release path skips a version npm holds, and publishes an absent one with provenance"
