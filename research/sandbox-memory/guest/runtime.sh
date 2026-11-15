#!/bin/sh
# In the conversation image: the SDK host run from source, from a bundle, compiled, and with
# --smol, 3 times each, then the start time of each form and of the CLI.
. "$(dirname "$0")/setup.sh"
# the bundled image holds the CLI at /app/claude; an image built before it holds it in its packages
if [ -x /app/claude ]; then
  CLAUDE_BIN=/app/claude
else
  CLAUDE_BIN=$(find /app/node_modules/.bun -path '*claude-agent-sdk-linux-x64/claude' | head -1)
fi
export CLAUDE_BIN
bun build turn.ts --target bun --outfile turn-bundle.js > /dev/null
bun build turn.ts --compile --outfile turnbin > /dev/null
ls -la turn-bundle.js turnbin "$CLAUDE_BIN"

for n in 1 2 3; do
  sh measure.sh "source$n" bun turn.ts | tail -1
  sh measure.sh "bundle$n" bun turn-bundle.js | tail -1
  sh measure.sh "compiled$n" ./turnbin | tail -1
  BUN_OPTIONS=--smol sh measure.sh "smol$n" bun --smol turn.ts | tail -1
done

for form in "bun turn.ts" "bun turn-bundle.js" "./turnbin" "$CLAUDE_BIN --version"; do
  for n in 1 2 3; do
    start=$(date +%s%N)
    PROMPT_FILE=/nonexistent $form > /dev/null 2>&1
    end=$(date +%s%N)
    echo "start form=\"$form\" ms=$(((end - start) / 1000000))"
  done
done
