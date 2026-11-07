#!/bin/sh
# Prints the summary line for one measured step: its exit status, the peak used and anonymous
# memory and each process's peak RSS in MiB, from the samples that sample.sh wrote, and the
# cgroup's peak, limit and limit hits. It lists the processes in the order they first appear.
# Usage: summarize-samples.sh <label> <status> <cgroup_peak_bytes> <cgroup_max_bytes> <max_hits> <samples_file>
awk -v label="$1" -v status="$2" -v cgpeak="$3" -v cgmax="$4" -v hits="$5" '
  function mib(v) { return v ~ /^[0-9]+$/ ? int(v / 1048576) : v }
  { split($2, u, "="); if (u[2] + 0 > used) used = u[2] + 0
    split($3, a, "="); if (a[2] + 0 > anon) anon = a[2] + 0
    for (i = 4; i <= NF; i++) {
      split($i, p, "="); split(p[2], q, "/")
      if (!(p[1] in rss)) { order[++count] = p[1]; rss[p[1]] = 0 }
      if (q[1] + 0 > rss[p[1]]) rss[p[1]] = q[1] + 0
    }
  }
  END {
    printf "%s status=%s peak used=%d anon=%d cgroup_peak=%s cgroup_max=%s cgroup_max_hits=%s samples=%d", label, status, used, anon, mib(cgpeak), mib(cgmax), hits, NR
    for (i = 1; i <= count; i++) printf " %s=%d", order[i], rss[order[i]]
    print ""
  }
' "$6"
