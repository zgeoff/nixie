#!/bin/sh
# Sourced by each guest script: moves to the spike folder, prints the guest's memory, links the
# conversation image's packages when it has them, and starts the stub tool server under its own
# process name.
cd "$(dirname "$0")" || exit 1
grep -E 'MemTotal|MemAvailable' /proc/meminfo
echo "user cgroup max: $(cat /sys/fs/cgroup/memory.max)"

if [ -d /app/guests/conversation/node_modules ]; then
  ln -sfn /app/guests/conversation/node_modules node_modules
  export ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder
  cp /usr/local/bin/bun ./mcpstub
  nohup ./mcpstub mcp-stub.ts > mcp-stub.log 2>&1 &
  sleep 1
fi
