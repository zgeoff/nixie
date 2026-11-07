#!/bin/sh
# Runs one command under the sampler, then prints one summary line: the command's exit status, the
# peak used and anonymous memory and each process's peak RSS, in MiB, and the user cgroup's peak
# and limit. The cgroup peak covers the guest's whole life so far, so it never falls between steps;
# cgroup_max_hits counts the times this step alone reached the limit.
# It writes its samples and its stop file to the working directory, and exits with the command's
# status. Usage: measure.sh <label> <command...>
label=$1
shift
here=$(dirname "$0")

# A cgroup with no memory.events, such as a host's root cgroup, counts no hits.
count_max_hits() {
  if [ -r /sys/fs/cgroup/memory.events ]; then
    awk '$1 == "max" { print $2 }' /sys/fs/cgroup/memory.events
  else
    echo 0
  fi
}

hits_before=$(count_max_hits)
rm -f stop
sh "$here/sample.sh" "samples-$label.txt" &
sampler=$!
sleep 0.5
"$@"
status=$?
sleep 1
touch stop
wait "$sampler"

cgroup_peak=$(cat /sys/fs/cgroup/memory.peak 2> /dev/null || echo unknown)
cgroup_max=$(cat /sys/fs/cgroup/memory.max 2> /dev/null || echo unknown)
max_hits=$(($(count_max_hits) - hits_before))
sh "$here/summarize-samples.sh" "$label" "$status" "$cgroup_peak" "$cgroup_max" "$max_hits" "samples-$label.txt"
exit "$status"
