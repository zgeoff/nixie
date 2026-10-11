#!/usr/bin/env bash
# Adds the version tag to each image digest, in the order given, and never changes a digest:
#   tag-images.sh <version> <repository>@sha256:<digest>...
# It refuses before it tags anything when a repository already gives the version to another digest,
# so a rebuild never moves a tag that a deployment may pin. A tag already on its digest stays as it
# is, so a re-run finishes a partly tagged release.
set -euo pipefail

version=$1
shift

# Prints the digest that a tag names, and nothing when the repository has no such tag.
read_tag_digest() {
  local out
  if out=$(docker buildx imagetools inspect "$1" --format '{{json .Manifest}}' 2>&1); then
    jq -r .digest <<<"$out"
  elif [[ $out == *": not found"* ]]; then
    return 0
  else
    printf '%s\n' "$out" >&2
    return 1
  fi
}

for ref in "$@"; do
  current=$(read_tag_digest "${ref%@*}:$version")
  if [[ -n $current && $current != "${ref#*@}" ]]; then
    echo "::error::${ref%@*}:$version already names $current, so the release refuses to tag ${ref#*@}"
    exit 1
  fi
done

for ref in "$@"; do
  docker buildx imagetools create --prefer-index=false --tag "${ref%@*}:$version" "$ref"
  current=$(read_tag_digest "${ref%@*}:$version")
  if [[ $current != "${ref#*@}" ]]; then
    echo "::error::${ref%@*}:$version names $current after tagging, not ${ref#*@}"
    exit 1
  fi
  echo "tagged ${ref%@*}:$version at ${ref#*@}"
done
