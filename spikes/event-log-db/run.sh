#!/usr/bin/env bash
# Runs every measurement against a fresh Postgres container and SQLite files under results/, then
# removes the container, its volume and the Litestream image's container.
set -euo pipefail
cd "$(dirname "$0")"
image=postgres:18.6
rm -rf results && mkdir -p results

docker run -d --name nixie-spike-pg -e POSTGRES_USER=spike -e POSTGRES_PASSWORD=spike \
  -e POSTGRES_DB=spike -p 55432:5432 -v nixie-spike-pgdata:/var/lib/postgresql "$image" > /dev/null
cleanup() {
  docker rm -f nixie-spike-pg nixie-spike-litestream > /dev/null 2>&1 || true
  docker volume rm nixie-spike-pgdata > /dev/null 2>&1 || true
}
trap cleanup EXIT
until docker exec nixie-spike-pg pg_isready -U spike -q 2> /dev/null; do sleep 0.2; done
sleep 2

echo '== 1. correctness'
for db in sqlite pg; do
  for mode in immediate unlocked; do
    SPIKE_DB=$db bun correctness.ts $mode > "results/correctness-$db-$mode.json"
  done
done
SPIKE_DB=sqlite bun correctness.ts deferred > results/correctness-sqlite-deferred.json
for mode in deferred immediate; do SPIKE_DB=sqlite bun rmw.ts $mode; done | tee results/rmw.jsonl
for mode in immediate for-update; do SPIKE_DB=pg bun rmw.ts $mode; done | tee -a results/rmw.jsonl

echo '== 2. wake-ups'
for strategy in pg-listen poll-query-1000 poll-query-100 poll-version-100 poll-version-10 watch-wal; do
  bun wake.ts $strategy
done | tee results/wake.jsonl

echo '== 3. load'
{
  SPIKE_DB=pg bun load.ts
  SPIKE_DB=sqlite bun load.ts
  SPIKE_DB=sqlite-worker bun load.ts
  SPIKE_DB=sqlite SPIKE_SQLITE_SYNC=FULL bun load.ts
} | tee results/load.jsonl

echo '== 4. operations'
bun ops.ts | tee results/ops.json
bash litestream.sh | tee results/litestream.json
