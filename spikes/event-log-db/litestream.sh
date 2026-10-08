#!/usr/bin/env bash
# Streams a SQLite log to a file replica with Litestream while load.ts writes to it, then restores
# the replica to a new file and compares it with the live database.
set -euo pipefail
cd "$(dirname "$0")"
dir="$PWD/results/litestream"
image=litestream/litestream:0.5.17
rm -rf "$dir" && mkdir -p "$dir/replica"
export SPIKE_DB=sqlite SPIKE_SQLITE_PATH="$dir/live.db"

# Create the schema first, so Litestream finds a WAL database to follow.
bun -e "import { createStore, setupSchema } from './db.ts'; const s = createStore('sqlite'); await setupSchema(s); await s.db.destroy();"
docker run -d --name nixie-spike-litestream --user "$(id -u):$(id -g)" -v "$dir:/data" \
  "$image" replicate /data/live.db file:///data/replica > /dev/null
trap 'docker rm -f nixie-spike-litestream > /dev/null 2>&1 || true' EXIT

bun load.ts > "$dir/load.json"
sleep 3
docker stop nixie-spike-litestream > /dev/null
docker logs nixie-spike-litestream > "$dir/litestream.log" 2>&1

start=$(date +%s%N)
docker run --rm --user "$(id -u):$(id -g)" -v "$dir:/data" \
  "$image" restore -o /data/restored.db file:///data/replica
restore_ms=$(( ($(date +%s%N) - start) / 1000000 ))

query='select count(*), max(id), (select sum(step) from tasks) from events'
echo "{\"restoreMs\": $restore_ms," \
  "\"live\": \"$(sqlite3 "$dir/live.db" "$query")\"," \
  "\"restored\": \"$(sqlite3 "$dir/restored.db" "$query")\"," \
  "\"integrity\": \"$(sqlite3 "$dir/restored.db" 'pragma integrity_check')\"," \
  "\"replicaFiles\": $(find "$dir/replica" -type f | wc -l)}"
