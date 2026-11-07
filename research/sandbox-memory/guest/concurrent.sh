#!/bin/sh
# In the conversation image: the large turn and two tool loops at once, as one VM would hold a
# conversation turn beside 2 system tasks, then the peak anonymous memory of their processes.
. "$(dirname "$0")/setup.sh"
bun write-large-prompt.ts large-prompt.txt
echo "Call read_ledger for pages 1 to 8, one call at a time, then say how many pages you read." > tools-prompt.txt

cat > three.sh << 'EOF'
PROMPT_FILE=large-prompt.txt bun turn.ts > one.out 2>&1 &
one=$!
MCP_URL=http://127.0.0.1:8901/mcp PROMPT_FILE=tools-prompt.txt bun turn.ts > two.out 2>&1 &
two=$!
MCP_URL=http://127.0.0.1:8901/mcp PROMPT_FILE=tools-prompt.txt bun turn.ts > three.out 2>&1 &
three=$!
status=0
# A bare wait returns 0 whatever each turn returns, so wait for each one.
for pid in $one $two $three; do wait "$pid" || status=1; done
exit "$status"
EOF

sh measure.sh three sh three.sh | tail -1
cat one.out two.out three.out
awk '{ s = 0; for (i = 4; i <= NF; i++) { split($i, p, "="); split(p[2], q, "/"); if (p[1] == "claude" || p[1] == "bun") s += q[2] } if (s > m) m = s } END { print "peak summed anon of claude and bun:", m }' samples-three.txt
grep -E 'oom' /sys/fs/cgroup/memory.events
