#!/usr/bin/env bash
# Runs publish-npm-package.sh on its release path against a stand-in for npm that records each call
# and keeps each published tarball, so a pull request proves the release's publish without npm:
#   check-publish-npm-package.sh <package dir>
# It checks that a package npm does not hold publishes nothing and passes with a warning, that a
# version npm holds already publishes nothing, that an absent version publishes the packed tarball
# with provenance, and that each run leaves package.json as it was.
set -euo pipefail

package=$1
name=$(jq -r .name "$package/package.json")
tarball=$(sed -E 's#^@##; s#/#-#' <<< "$name")-1.2.3.tgz

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin"
cat > "$work/bin/npm" << 'STUB'
#!/usr/bin/env bash
# stands in for npm: fails each view with npm's 404 while NO_PACKAGE is set, answers a view of the
# package's name with that name and a view of the PUBLISHED version with that version, fails a view
# of any other version with npm's 404, and keeps each published tarball
if [[ $1 == view ]]; then
  printf 'view %s\n' "${*:2}" >> "$STUB_DIR/calls.log"
  if [[ -n ${NO_PACKAGE:-} ]]; then
    echo "npm error code E404" >&2
    exit 1
  fi
  if [[ $3 == name ]]; then
    echo "$2"
    exit 0
  fi
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
    .github/scripts/publish-npm-package.sh "$package" 1.2.3 > "$work/$1/out.log"
  git diff --quiet -- "$package/package.json"
}

NO_PACKAGE=1 run_publish no-package
diff <(printf '%s\n' "view $name name") "$work/no-package/calls.log"
grep -q "^::warning::npm holds no $name yet" "$work/no-package/out.log"
[[ -z $(ls -A "$work/no-package/published") ]]

run_publish published 1.2.3
diff <(printf '%s\n' "view $name name" "view $name@1.2.3 version") "$work/published/calls.log"
grep -qx "$name@1.2.3 is on npm already" "$work/published/out.log"
[[ -z $(ls -A "$work/published/published") ]]

run_publish absent
diff <(printf '%s\n' \
  "view $name name" \
  "view $name@1.2.3 version" \
  "publish $tarball --access public --provenance") "$work/absent/calls.log"
[[ $(tar -xzOf "$work/absent/published/$tarball" package/package.json | jq -r .version) == 1.2.3 ]]

echo "the release path for $name skips a package npm lacks and a version npm holds, and publishes an absent version with provenance"
