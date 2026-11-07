#!/usr/bin/env bash
# Time a create to first exec, and a sleep then a wake to first exec, on huge pages.
# Usage: time-starts.sh <image> <memory_mib> <vcpus> <runs>
# Creates one imp at a time named memprobe-time-<pid>-<n>, and removes it before the next one. The
# script's process ID keeps 2 timings that run at once from sharing a name.
set -euo pipefail
image=$1 memory=$2 vcpus=$3 runs=$4

now_ms() { echo $(($(date +%s%N) / 1000000)); }

# A failed removal leaves the test imp behind, so say so.
remove_imp() {
  if ! impz rm "$name" > /dev/null; then
    echo "time-starts.sh: failed to remove the test imp; remove it with: impz rm $name" >&2
    return 1
  fi
}

# The script keeps its own failure status, and fails with 1 when only the removal failed.
remove_imp_on_exit() {
  local status=$?

  if ! remove_imp && [ "$status" -eq 0 ]; then
    status=1
  fi

  exit "$status"
}

for n in $(seq 1 "$runs"); do
  name="memprobe-time-$$-$n"
  if impz ls | grep -q "^$name "; then
    echo "refusing: $name exists" >&2
    exit 1
  fi
  t0=$(now_ms)
  impz new --image "$image" --memory "$memory" --cpus "$vcpus" --policy none "$name" > /dev/null
  # Only an imp this script created is its to remove.
  trap remove_imp_on_exit EXIT
  impz exec "$name" -- true
  t1=$(now_ms)
  # Touch 64 MiB of guest memory through tmpfs, so the wake restores a used guest. /dev/shm holds
  # half of MemTotal, so 64 MiB fits the smallest guest timed here, a 192 MiB fetch. set -e stops
  # the script when the write fails.
  impz exec "$name" -- sh -c 'dd if=/dev/zero of=/dev/shm/touch bs=1M count=64 2> /dev/null && rm /dev/shm/touch'
  impz sleep "$name" > /dev/null
  t2=$(now_ms)
  impz exec "$name" -- true
  t3=$(now_ms)
  impz sleep "$name" > /dev/null
  t4=$(now_ms)
  impz exec "$name" -- true
  t5=$(now_ms)
  trap - EXIT
  remove_imp
  echo "run=$n image=$image memoryMib=$memory create_to_exec_ms=$((t1 - t0)) wake1_to_exec_ms=$((t3 - t2)) wake2_to_exec_ms=$((t5 - t4))"
done
