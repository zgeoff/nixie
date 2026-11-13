#!/bin/sh
# Sourced by each guest script: moves to the spike folder, prints the guest's memory, and starts,
# when the guest runs in the conversation image, the stub tool server under its own
# process name.
cd "$(dirname "$0")" || exit 1
grep -E 'MemTotal|MemAvailable' /proc/meminfo
echo "user cgroup max: $(cat /sys/fs/cgroup/memory.max)"

if [ -d /app/conversation ]; then
  export ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder
  cp /usr/local/bin/bun ./mcpstub
  nohup ./mcpstub mcp-stub.ts > mcp-stub.log 2>&1 &
  sleep 1
fi
