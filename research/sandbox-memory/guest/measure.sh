#!/bin/sh
# Runs one command under the sampler, then prints the peak used and anonymous memory and each
# process's peak RSS, in MiB.
# Usage: measure.sh <label> <command...>
label=$1
shift
rm -f stop
sh sample.sh "samples-$label.txt" &
sleep 0.5
"$@"
echo "exit=$?"
sleep 1
touch stop
wait

awk -v label="$label" '
  { split($2, u, "="); if (u[2] + 0 > used) used = u[2] + 0
    split($3, a, "="); if (a[2] + 0 > anon) anon = a[2] + 0
    for (i = 4; i <= NF; i++) { split($i, p, "="); split(p[2], q, "/"); if (q[1] + 0 > rss[p[1]] + 0) rss[p[1]] = q[1] }
  }
  END { printf "%s peak used=%d anon=%d samples=%d", label, used, anon, NR; for (k in rss) printf " %s=%d", k, rss[k]; print "" }
' "samples-$label.txt"
