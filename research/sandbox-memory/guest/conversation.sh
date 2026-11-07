#!/bin/sh
# In the conversation image: a short turn, a turn of about 235k input tokens, a resume of that
# session, and an 8-call tool loop, each under the sampler, then the OOM counters.
. "$(dirname "$0")/setup.sh"
bun write-large-prompt.ts large-prompt.txt
echo "Call read_ledger for pages 1 to 8, one call at a time, then say how many pages you read." > tools-prompt.txt
echo "Summarize note 12 in one line." > resume-prompt.txt

sh measure.sh short bun turn.ts | tail -3
PROMPT_FILE=large-prompt.txt sh measure.sh large bun turn.ts > large.out
tail -3 large.out
session=$(grep -o '"sessionID":"[^"]*"' large.out | cut -d'"' -f4)
RESUME=$session PROMPT_FILE=resume-prompt.txt sh measure.sh resume bun turn.ts | tail -3
MCP_URL=http://127.0.0.1:8901/mcp PROMPT_FILE=tools-prompt.txt sh measure.sh tools bun turn.ts | tail -3
grep -E 'oom' /sys/fs/cgroup/memory.events
