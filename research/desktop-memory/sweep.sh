#!/bin/sh
# Usage: sweep.sh <scenario> <runs>; baseline of the bare guest first, OOM count after each run.
export PLAYWRIGHT_BROWSERS_PATH=/opt/browsers DISPLAY=:1
for _ in $(seq 1 "$2"); do
  pkill -9 -f 'chrom|Xvfb|openbox|xterm|x11vnc|vncviewer' 2> /dev/null
  sleep 2
  sync
  echo 3 > /proc/sys/vm/drop_caches
  sleep 1
  before=$(dmesg | grep -ci 'out of memory\|oom-kill')
  bare=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{printf "%d",(t-a)/1024}' /proc/meminfo)
  r=$(cd /root/spike && bun run.ts "$1" 2>&1 | tail -1)
  after=$(dmesg | grep -ci 'out of memory\|oom-kill')
  echo "$r" | sed "s/^{/{\"bareUsedMiB\":$bare,\"oomEvents\":$((after - before)),/"
done
pkill -9 -f 'chrom|Xvfb|openbox|xterm|x11vnc|vncviewer' 2> /dev/null
