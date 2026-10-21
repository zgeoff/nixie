#!/usr/bin/env bash
# Prints each commit a push sends, once, one per line, so the pre-push jobs check what the push
# sends rather than the working tree. git gives the hook one line per ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
# A ref the push deletes sends no commit, and nor does a tag on anything but a commit. With no ref
# lines, as when `lefthook run pre-push` runs by hand, it prints HEAD's commit.
set -euo pipefail

lines=''
if [ ! -t 0 ]; then
  lines=$(cat)
fi

if [ -z "$lines" ]; then
  git rev-parse --verify HEAD
  exit
fi

while read -r _ sha _; do
  # a deleted ref's sha is all zeros
  if [[ -z $sha || $sha =~ ^0+$ ]]; then
    continue
  fi
  git rev-parse --verify --quiet "$sha^{commit}" || true
done <<< "$lines" | awk '!seen[$0]++'
