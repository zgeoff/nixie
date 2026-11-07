#!/bin/sh
# Runs one command under the sampler, then prints one summary line: the command's exit status, the
# peak used and anonymous memory and each process's peak RSS, in MiB, and the user cgroup's peak
# and limit. The cgroup peak covers the guest's whole life so far, so it never falls between steps.
# Usage: measure.sh <label> <command...>
label=$1
shift
rm -f stop
sh sample.sh "samples-$label.txt" &
sampler=$!
sleep 0.5
"$@"
status=$?
sleep 1
touch stop
wait "$sampler"

cgroup_peak=$(cat /sys/fs/cgroup/memory.peak 2> /dev/null || echo unknown)
cgroup_max=$(cat /sys/fs/cgroup/memory.max 2> /dev/null || echo unknown)
awk -v label="$label" -v status="$status" -v cgpeak="$cgroup_peak" -v cgmax="$cgroup_max" '
  function mib(v) { return v ~ /^[0-9]+$/ ? int(v / 1048576) : v }
  { split($2, u, "="); if (u[2] + 0 > used) used = u[2] + 0
    split($3, a, "="); if (a[2] + 0 > anon) anon = a[2] + 0
    for (i = 4; i <= NF; i++) { split($i, p, "="); split(p[2], q, "/"); if (q[1] + 0 > rss[p[1]] + 0) rss[p[1]] = q[1] }
  }
  END {
    printf "%s status=%s peak used=%d anon=%d cgroup_peak=%s cgroup_max=%s samples=%d", label, status, used, anon, mib(cgpeak), mib(cgmax), NR
    for (k in rss) printf " %s=%d", k, rss[k]
    print ""
  }
' "samples-$label.txt"
exit "$status"
