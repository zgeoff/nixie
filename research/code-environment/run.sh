#!/usr/bin/env bash
# Builds the code image, the worker image and one size image per package group, records their sizes,
# runs the programs and probes in the code and worker images, and prints the summary. Run it on any
# machine with Docker, from this folder.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
samples="${SPIKE_SAMPLES:-5}"
conversation=spike-ce-conversation
code=spike-ce-code
worker=spike-ce-worker
base=debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4
declare -A groups=(
  [node]="nodejs"
  [npm]="nodejs npm"
  [python]="python3"
  [pip]="python3 python3-pip python3-venv"
  [toolbox]="jq ripgrep file less procps findutils gawk sed grep coreutils ca-certificates curl"
)
# The code image's packages less npm, which a code run cannot use with no network.
groups[no-npm]="nodejs python3 python3-pip python3-venv ${groups[toolbox]}"

names=(spike-ce-base "$conversation" "$code" "$worker")
for group in "${!groups[@]}"; do
  names+=("spike-ce-size-$group")
done
for name in "${names[@]}"; do
  if docker image inspect "$name" > /dev/null 2>&1; then
    echo "image $name exists; remove it first" >&2
    exit 1
  fi
done

cleanup() {
  docker rmi -f "${names[@]}" > /dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$here"
rm -rf results
mkdir -p results

docker build -q -f "$repo/guests/conversation/Dockerfile" -t "$conversation" "$repo" > /dev/null
docker build -q -f "$repo/research/worker-cold-start/Dockerfile" --build-arg "BASE=$conversation" \
  --build-arg RUNTIMES=yes -t "$worker" "$repo/research" > /dev/null
docker build -q -f Dockerfile -t "$code" . > /dev/null
for group in "${!groups[@]}"; do
  docker build -q -f Dockerfile.size --build-arg "PACKAGES=${groups[$group]}" \
    -t "spike-ce-size-$group" . > /dev/null
done

# Disk usage is the size that `docker images` prints, which the worker cold start spike recorded.
# Content size is the compressed size of the image's layers, which a registry stores and a host pulls.
docker pull -q "$base" > /dev/null
docker tag "$base" spike-ce-base
{
  echo "image disk content_bytes root_files_kib packages"
  for name in "${names[@]}"; do
    disk="$(docker images --format '{{.Size}}' "$name")"
    content="$(docker image inspect --format '{{.Size}}' "$name")"
    files="$(docker run --rm --user root --entrypoint du "$name" -sxk / | cut -f1)"
    packages="$(docker run --rm --entrypoint dpkg-query "$name" -f '.\n' -W | wc -l)"
    echo "$name $disk $content $files $packages"
  done
} | tee results/images.txt

SPIKE_IMAGES="$code,$worker,spike-ce-size-no-npm" bun bench.ts "$samples"
bun summarize.ts | tee results/summary.md
