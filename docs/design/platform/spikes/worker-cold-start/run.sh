#!/usr/bin/env bash
# Builds the conversation, worker and fetch images, runs every phase, and prints the summary.
# Run it as root inside an imp guest with Docker and imp's broker: it empties the page cache before
# each cold sample, and the turns reach the model through the broker's proxy.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../../../.." && pwd)"
samples="${SPIKE_SAMPLES:-10}"
conversation=spike-wcs-conversation
fetch=spike-wcs-fetch
box=spike-wcs-fetch-box
images=(spike-wcs-turn-no spike-wcs-turn-yes)

for name in "$conversation" "$fetch" "${images[@]}"; do
  if docker image inspect "$name" >/dev/null 2>&1; then
    echo "image $name exists; remove it first" >&2
    exit 1
  fi
done
if docker container inspect "$box" >/dev/null 2>&1; then
  echo "container $box exists; remove it first" >&2
  exit 1
fi
: "${HTTPS_PROXY:?set HTTPS_PROXY to the broker proxy}"
: "${SSL_CERT_FILE:?set SSL_CERT_FILE to the broker CA}"

cleanup() {
  docker rm -f "$box" >/dev/null 2>&1 || true
  docker rmi -f "${images[@]}" "$conversation" "$fetch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$here"
rm -rf results
mkdir -p results

SECONDS=0
docker build -q -f "$repo/guests/conversation/Dockerfile" -t "$conversation" "$repo" >/dev/null
echo "conversation image: ${SECONDS}s" | tee results/build.txt
for runtimes in no yes; do
  SECONDS=0
  docker build -q -f "$here/Dockerfile" --build-arg "BASE=$conversation" \
    --build-arg "RUNTIMES=$runtimes" -t "spike-wcs-turn-$runtimes" "$here/.." >/dev/null
  echo "turn image, runtimes $runtimes: ${SECONDS}s" | tee -a results/build.txt
done
SECONDS=0
docker build -q -f "$repo/guests/fetch/Dockerfile" -t "$fetch" "$repo" >/dev/null
echo "fetch image: ${SECONDS}s" | tee -a results/build.txt
docker images --format '{{.Repository}} {{.Size}}' | grep spike-wcs | tee results/images.txt

# The long-lived fetch sandbox, for the fetcher-per-fetch comparison.
docker run -d --name "$box" --cpus 1 --memory 512m --memory-swap 512m \
  --entrypoint sleep "$fetch" infinity >/dev/null

export SPIKE_IMAGES="${images[0]},${images[1]}" SPIKE_FETCH_IMAGE="$fetch" SPIKE_FETCH_BOX="$box"
export SPIKE_PROXY="$HTTPS_PROXY" SPIKE_CA="$SSL_CERT_FILE"
export NIXIE_MODEL="${NIXIE_MODEL:-claude-haiku-5-5}"
export SPIKE_FETCH_URL="${SPIKE_FETCH_URL:-https://example.com/}"

for phase in start fetch turn; do
  bun bench.ts "$phase" "$samples"
done
bun summarize.ts | tee results/summary.md
