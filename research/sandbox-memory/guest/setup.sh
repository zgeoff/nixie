#!/bin/sh
# Sourced by each guest script: moves to the spike folder, prints the guest's memory, and, in a
# conversation image, sets the broker's placeholder credential and starts the stub tool server under
# its own process name. An image built before the bundled guest also gets its packages linked in, so
# the turn.ts scenarios can import the SDK.
cd "$(dirname "$0")" || exit 1
grep -E 'MemTotal|MemAvailable' /proc/meminfo
echo "user cgroup max: $(cat /sys/fs/cgroup/memory.max)"

if [ -d /app/guests/conversation/node_modules ]; then
  ln -sfn /app/guests/conversation/node_modules node_modules
fi

if [ -d /app/conversation ] || [ -d /app/guests/conversation ]; then
  export ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder
  cp /usr/local/bin/bun ./mcpstub
  nohup ./mcpstub mcp-stub.ts > mcp-stub.log 2>&1 &
  sleep 1
fi
