#!/bin/sh
# Prints a newly booted guest's memory, its processes over 5 MiB, and what its image holds on disk.
# It skips setup.sh, whose copy of Bun and stub server would add to the idle figures.
cd "$(dirname "$0")" || exit 1
grep -E 'MemTotal|MemFree|MemAvailable|^Cached|AnonPages|Slab' /proc/meminfo
sh sample.sh idle-sample.txt &
sampler=$!
sleep 0.3
touch stop
wait "$sampler"
tail -1 idle-sample.txt
du -sxm /usr /app /var /etc 2>/dev/null
du -sm /usr/local/bin/bun 2>/dev/null

if [ -d /app/node_modules/.bun ]; then
  du -sm /app/node_modules/.bun/* | sort -rn | head -5
fi
