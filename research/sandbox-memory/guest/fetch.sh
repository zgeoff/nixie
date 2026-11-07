#!/bin/sh
# In the fetch image: each URL through the real fetcher in turn, then all of them at once, as
# one shared fetch VM would read them. Usage: fetch.sh <url...>
# The fetcher exits 0 when it refuses or fails a page, so the script checks each reply's kind and
# prints `bad reply` for any reply that isn't a page.
. "$(dirname "$0")/setup.sh"
n=0

check_reply() {
  kind=$(tail -c +5 "$1" | head -c 40 | sed -n 's/^{"kind":"\([a-z]*\)".*/\1/p')

  if [ "$kind" != page ]; then
    echo "bad reply $1 kind=${kind:-none}"
  fi
}

for url in "$@"; do
  n=$((n + 1))
  bun write-frame.ts fetch "$url" "request$n.bin"
  sh measure.sh "fetch$n" sh -c "bun /app/fetch.js < request$n.bin > reply$n.bin" | tail -1
  echo "fetch$n url=$url replyBytes=$(wc -c < "reply$n.bin") $(tail -c +5 "reply$n.bin" | head -c 60)"
  check_reply "reply$n.bin"
done

: > together.sh

for i in $(seq 1 "$n"); do
  echo "bun /app/fetch.js < request$i.bin > together$i.bin &" >> together.sh
done

echo wait >> together.sh
sh measure.sh together sh together.sh | tail -1

for i in $(seq 1 "$n"); do
  check_reply "together$i.bin"
done

awk '{ s = 0; for (i = 4; i <= NF; i++) { split($i, p, "="); split(p[2], q, "/"); if (p[1] == "bun") s += q[2] } if (s > m) m = s } END { print "peak summed anon of the fetchers:", m }' samples-together.txt
grep -E 'oom' /sys/fs/cgroup/memory.events
