// Runs one turn on a session and prints a line per stream event, so that the parent can kill the
// whole process group in the middle of the turn, as a crash would.
// Usage: bun --no-env-file crash-turn.ts <config-dir> <session-id> <prompt> <system-prompt> [tool]
// With a tool, the turn may call it, without a permission prompt, across up to 4 model calls.
// The CLI gets this process's own environment, so the token never travels as an argument.
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const [configDir, sessionID, prompt, systemPrompt, tool] = process.argv.slice(2),
  cwd = resolve(import.meta.dir);

if (!configDir || !sessionID || !prompt || !systemPrompt) {
  throw new Error('usage: crash-turn.ts <config-dir> <session-id> <prompt> <system-prompt>');
}

// one text event per compaction, so that the parent sees text that streams after a compaction
let hasPrintedText = false;

for await (const message of query({
  options: {
    cwd,
    env: process.env,
    includePartialMessages: true,
    ...(tool === undefined ? { maxTurns: 1, tools: [] } : { allowedTools: [tool], maxTurns: 4, tools: [tool] }),
    model: 'claude-haiku-4-5-20251001',
    resume: sessionID,
    settingSources: [],
    systemPrompt,
  },
  prompt,
})) {
  if (message.type === 'system' && message.subtype === 'compact_boundary') {
    console.log(`event compact_boundary ${JSON.stringify(message.compact_metadata)}`);
    hasPrintedText = false;
  } else if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        console.log(`event tool_use ${block.name}`);
      }
    }
  } else if (
    message.type === 'user' &&
    Array.isArray(message.message.content) &&
    message.message.content.some((block) => block.type === 'tool_result')
  ) {
    console.log('event tool_result');
  } else if (
    message.type === 'stream_event' &&
    message.event.type === 'content_block_delta' &&
    message.event.delta.type === 'text_delta' &&
    !hasPrintedText
  ) {
    hasPrintedText = true;
    console.log('event text');
  } else if (message.type === 'result') {
    console.log(`event result ${message.subtype}`);
  }
}
