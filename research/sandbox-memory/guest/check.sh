#!/bin/sh
# In the conversation image: one check request through the guest's real check entry, as the
# system task runner starts it. Usage: check.sh <model>
. "$(dirname "$0")/setup.sh"
bun write-frame.ts check "$1" check-request.bin
HOME=$(pwd) sh measure.sh check sh -c 'bun /app/conversation/check.js < check-request.bin > check-reply.bin' | tail -2
tail -c +5 check-reply.bin | head -c 400
echo
grep -E 'oom' /sys/fs/cgroup/memory.events
