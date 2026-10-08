#!/usr/bin/env bash
# Runs the whole spike on local containers: an image pinned by digest from a local registry,
# secrets encrypted with sops and age, backups to local restic repos, a restore on a clean host
# directory from the owner's recovery key alone, and an upgrade rolled back as a revert plus a
# restore. Every container, volume and image it makes is removed on exit.
set -euo pipefail
cd "$(dirname "$0")"
spike=$PWD
work=$spike/results
registry_image=registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373
sops_image=ghcr.io/getsops/sops:v3.13.3-alpine@sha256:ae501277bf742f1662e0f881f43dd8fd6798b489a8058e921dbf6cda597140ea
registry=127.0.0.1:55100
app_repo=$registry/nixie-spike-deploy-app
reg_container=nixie-spike-deploy-registry
project=nixie-spike-deploy
clean_project=nixie-spike-deploy-clean
pass=0
fail=0

for name in "$project" "$clean_project"; do
  if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$name")" ]; then
    echo "compose project $name exists; remove it first" >&2
    exit 1
  fi
done
if docker container inspect "$reg_container" > /dev/null 2>&1; then
  echo "container $reg_container exists; remove it first" >&2
  exit 1
fi

cleanup() {
  if [ -f "$work/host/deploy-repo/compose.yaml" ]; then
    (cd "$work/host/deploy-repo" && docker compose -p "$project" down -v --remove-orphans > /dev/null 2>&1 || true)
  fi
  if [ -f "$work/clean-host/deploy-repo/compose.yaml" ]; then
    (cd "$work/clean-host/deploy-repo" && docker compose -p "$clean_project" down -v --remove-orphans > /dev/null 2>&1 || true)
  fi
  docker rm -f -v "$reg_container" > /dev/null 2>&1 || true
  for ref in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$app_repo" || true); do
    docker rmi -f "$ref" > /dev/null 2>&1 || true
  done
  for id in $(docker images -q --filter "reference=$app_repo" || true); do
    docker rmi -f "$id" > /dev/null 2>&1 || true
  done
}
trap cleanup EXIT

check() {
  local description=$1
  shift
  if "$@"; then
    echo "PASS $description"
    pass=$((pass + 1))
  else
    echo "FAIL $description"
    fail=$((fail + 1))
  fi
}

ms_since() { echo $((($(date +%s%N) - $1) / 1000000)); }

rm -rf "$work"
mkdir -p "$work/owner" "$work/host/age" "$work/host/data" "$work/offsite" "$work/clean-host/data"
export NIXIE_UID NIXIE_GID NIXIE_AGE_KEY_FILE NIXIE_DATA_DIR NIXIE_OFFSITE_DIR NIXIE_PORT
NIXIE_UID=$(id -u)
NIXIE_GID=$(id -g)
NIXIE_OFFSITE_DIR=$work/offsite

echo "== registry and images"
docker run -d --name "$reg_container" -p "$registry:5000" "$registry_image" > /dev/null
for build in 1 2; do
  docker build -q --build-arg "NIXIE_BUILD=$build" -t "$app_repo:build$build" . > /dev/null
  docker push -q "$app_repo:build$build" > /dev/null
done
digest1=$(docker image inspect --format '{{index .RepoDigests 0}}' "$app_repo:build1")
digest2=$(docker image inspect --format '{{index .RepoDigests 0}}' "$app_repo:build2")
docker rmi "$app_repo:build1" "$app_repo:build2" > /dev/null
echo "build1 $digest1"
echo "build2 $digest2"
image_mb=$(docker image inspect --format '{{.Size}}' "oven/bun:1.4.2-slim" | awk '{printf "%d", $1/1000000}')

echo "== keys and the deployment repo"
host_recipient=$(bun keygen.ts "$work/host/age/host.key" x25519)
recovery_recipient=$(bun keygen.ts "$work/owner/recovery.key" hybrid)
deployment_key=$(head -c 32 /dev/urandom | base64)
restic_password=$(head -c 24 /dev/urandom | base64)
repo=$work/host/deploy-repo
mkdir -p "$repo"
git -C "$repo" init -q -b main
git -C "$repo" config user.email spike@example.invalid
git -C "$repo" config user.name spike
printf 'creation_rules:\n  - path_regex: secrets\\.yaml$\n    age: %s,%s\n' \
  "$host_recipient" "$recovery_recipient" > "$repo/.sops.yaml"
printf 'deployment_key: %s\nrestic_password: %s\n' "$deployment_key" "$restic_password" > "$repo/secrets.yaml"
if docker run --rm --user "$NIXIE_UID:$NIXIE_GID" -v "$repo:/repo" -w /repo "$sops_image" \
  encrypt --in-place secrets.yaml 2> "$work/sops-encrypt.log"; then
  hybrid_ok=0
else
  hybrid_ok=1
fi
check "sops 3.13.3 encrypts to a post-quantum hybrid age recipient" test "$hybrid_ok" = 0
if [ "$hybrid_ok" != 0 ]; then
  cat "$work/sops-encrypt.log"
  exit 1
fi
sed "s|NIXIE_IMAGE|$digest1|" compose.template.yaml > "$repo/compose.yaml"
git -C "$repo" add -A
git -C "$repo" commit -q -m "deploy build 1"

no_plaintext_in_repo() {
  ! git -C "$repo" log -p --all | grep -qF -e "$deployment_key" -e "$restic_password" &&
    ! grep -rqF -e "$deployment_key" -e "$restic_password" "$repo"
}
check "the deployment repo and its history hold no plaintext secret" no_plaintext_in_repo

echo "== start build 1, pulled by digest"
NIXIE_AGE_KEY_FILE=$work/host/age/host.key
NIXIE_DATA_DIR=$work/host/data
NIXIE_PORT=55101
compose() { (cd "$repo" && docker compose -p "$project" "$@"); }
started=$(date +%s%N)
compose up -d --wait --quiet-pull > /dev/null 2>&1
first_start_ms=$(ms_since "$started")
health() { curl -fsS "http://127.0.0.1:$NIXIE_PORT/health"; }
check "build 1 is healthy at schema 1" test "$(health | jq -r '"\(.build) \(.schema)"')" = "1 1"
container=$(compose ps -q nixie)
no_plaintext_in_config() {
  ! compose config | grep -qF "$deployment_key" &&
    ! docker inspect "$container" | grep -qF -e "$deployment_key" -e "$restic_password" &&
    ! docker exec "$container" env | grep -qF "$deployment_key"
}
check "no secret in the Compose config, the container's config or its exec environment" no_plaintext_in_config
no_plaintext_on_disk() { ! grep -rqF -e "$deployment_key" -e "$restic_password" "$work/host/data"; }
check "no secret on the host's data directory" no_plaintext_on_disk
started=$(date +%s%N)
docker restart "$container" > /dev/null
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy ]; do sleep 0.2; done
restart_ms=$(ms_since "$started")
check "a plain container restart decrypts again and comes back healthy" test "$(health | jq -r .status)" = ok
decrypt_ms=$(docker logs "$container" 2>&1 | jq -r 'select(.decryptMs) | .decryptMs' | tail -1)

echo "== memory items, forget, backups"
ids=()
for text in alpha bravo charlie; do
  ids+=("$(curl -fsS -X POST --data "$text" "http://127.0.0.1:$NIXIE_PORT/memory" | jq -r .id)")
done
wrapped2=$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/debug-wrapped/${ids[1]}" | jq -r .wrappedHex)
run_app() { compose exec -T nixie bun app.ts "$@" 2>> "$work/app-stderr.log" | tee -a "$work/app-stdout.log"; }
started=$(date +%s%N)
run_app backup split > /dev/null
backup_ms=$(ms_since "$started")
run_app backup naive > /dev/null
curl -fsS -X POST "http://127.0.0.1:$NIXIE_PORT/forget/${ids[1]}" > /dev/null
check "item 2 reads as forgotten in the live store" \
  test "$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/memory" | jq -c '[.[] | .text]')" = '["alpha",null,"charlie"]'
key_bytes_gone() {
  ! cat "$work/host/data"/keys.db* | xxd -p | tr -d '\n' | grep -qi "$wrapped2"
}
check "the forgotten wrapped key is gone from the key store's files (secure_delete, checkpoint)" key_bytes_gone
run_app backup split > /dev/null
run_app backup naive > /dev/null
snapshot_count() { run_app snapshots "$1" | jq length; }
check "the key store repo keeps 1 snapshot" test "$(snapshot_count keys)" = 1
check "the database repo keeps both snapshots" test "$(snapshot_count data)" = 2
first_data=$(run_app snapshots data | jq -r '.[0].short_id')
first_naive=$(run_app snapshots naive | jq -r '.[0].short_id')
run_app restore data "$first_data" /data/check-old > /dev/null
run_app restore keys latest /data/check-old > /dev/null
check "an older database snapshot with the current key store keeps item 2 forgotten" \
  test "$(run_app read /data/check-old/nixie.db /data/check-old/keys.db | jq -c '[.[] | .text]')" = '["alpha",null,"charlie"]'
run_app restore naive "$first_naive" /data/check-naive > /dev/null
check "a single repo with normal retention brings item 2 back (the case to avoid)" \
  test "$(run_app read /data/check-naive/nixie.db /data/check-naive/keys.db | jq -r '.[1].text')" = bravo

echo "== lose the host, restore on a clean one from the recovery key"
compose down > /dev/null 2>&1
clean_repo=$work/clean-host/deploy-repo
git clone -q "$repo" "$clean_repo"
NIXIE_AGE_KEY_FILE=$work/owner/recovery.key
NIXIE_DATA_DIR=$work/clean-host/data
NIXIE_PORT=55102
clean_compose() { (cd "$clean_repo" && docker compose -p "$clean_project" "$@"); }
started=$(date +%s%N)
clean_compose run --rm --no-deps -T nixie bun app.ts restore data latest /data > /dev/null 2>&1
clean_compose run --rm --no-deps -T nixie bun app.ts restore keys latest /data > /dev/null 2>&1
clean_compose up -d --wait > /dev/null 2>&1
clean_restore_ms=$(ms_since "$started")
check "the clean host starts healthy from the restic repos and the recovery key alone" \
  test "$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/health" | jq -r '"\(.status) \(.integrity) \(.items) \(.keys)"')" = "ok ok 3 2"
check "the clean host reads items 1 and 3, and item 2 stays forgotten" \
  test "$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/memory" | jq -c '[.[] | .text]')" = '["alpha",null,"charlie"]'
clean_compose down > /dev/null 2>&1

echo "== upgrade to build 2, then roll back"
NIXIE_AGE_KEY_FILE=$work/host/age/host.key
NIXIE_DATA_DIR=$work/host/data
NIXIE_PORT=55101
compose up -d --wait > /dev/null 2>&1
sed -i "s|$digest1|$digest2|" "$repo/compose.yaml"
git -C "$repo" commit -q -am "upgrade to build 2"
started=$(date +%s%N)
compose up -d --wait --quiet-pull > /dev/null 2>&1
upgrade_ms=$(ms_since "$started")
check "build 2 is healthy at schema 2" test "$(health | jq -r '"\(.build) \(.schema)"')" = "2 2"
pre_migration=$(ls "$work/host/data/backups"/pre-migration-1-to-2-*.db 2> /dev/null | head -1)
check "build 2 took a database backup before it migrated" test -n "$pre_migration"
curl -fsS -X POST --data delta "http://127.0.0.1:$NIXIE_PORT/memory" > /dev/null
curl -fsS -X POST "http://127.0.0.1:$NIXIE_PORT/forget/${ids[2]}" > /dev/null

git -C "$repo" revert --no-edit HEAD > /dev/null
if compose up -d --wait > /dev/null 2>&1; then reverted_up=0; else reverted_up=1; fi
check "the reverted pin alone does not start: build 1 refuses schema 2" test "$reverted_up" = 1
refusal_logged() { compose logs nixie 2>&1 | grep -q "newer than build 1"; }
check "build 1 says why it refused" refusal_logged
compose stop nixie > /dev/null 2>&1
cp "$pre_migration" "$work/host/data/nixie.db"
rm -f "$work/host/data/nixie.db-wal" "$work/host/data/nixie.db-shm"
started=$(date +%s%N)
compose up -d --wait > /dev/null 2>&1
rollback_ms=$(ms_since "$started")
check "after the restore, build 1 is healthy at schema 1" test "$(health | jq -r '"\(.build) \(.schema)"')" = "1 1"
check "the rollback lost item 4, written after the upgrade, and item 3 stays forgotten" \
  test "$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/memory" | jq -c '[.[] | .text]')" = '["alpha",null,null]'
write_after_rollback() {
  curl -fsS -X POST --data foxtrot "http://127.0.0.1:$NIXIE_PORT/memory" > /dev/null &&
    test "$(curl -fsS "http://127.0.0.1:$NIXIE_PORT/memory" | jq -r '.[3].text')" = foxtrot
}
check "a write after the rollback succeeds, with no ID reused from the discarded span" write_after_rollback
run_app restore keys latest /data/check-stale-keys > /dev/null
check "a key store copy from before the forget would bring item 3 back (never restore it on rollback)" \
  test "$(run_app read /data/nixie.db /data/check-stale-keys/keys.db | jq -r '.[2].text')" = charlie

jq -n --arg imageBase "${image_mb}MB" --argjson firstStartMs "$first_start_ms" \
  --argjson restartMs "$restart_ms" --argjson decryptMs "${decrypt_ms:-0}" \
  --argjson backupMs "$backup_ms" --argjson cleanRestoreMs "$clean_restore_ms" \
  --argjson upgradeMs "$upgrade_ms" --argjson rollbackMs "$rollback_ms" \
  --argjson pass "$pass" --argjson fail "$fail" \
  '{pass: $pass, fail: $fail, timings: {firstStartMs: $firstStartMs, restartMs: $restartMs, decryptMs: $decryptMs, backupMs: $backupMs, cleanRestoreMs: $cleanRestoreMs, upgradeMs: $upgradeMs, rollbackMs: $rollbackMs}, bunBase: $imageBase}' |
  tee "$work/summary.json"
test "$fail" = 0
