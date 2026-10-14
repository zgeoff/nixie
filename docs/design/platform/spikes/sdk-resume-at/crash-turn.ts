// Runs one turn on a session and prints a line per stream event, so that the parent can kill the
// whole process group in the middle of the turn, as a crash would.
// Usage: bun --no-env-file crash-turn.ts <config-dir> <session-id> <prompt> <env-json> <system-prompt>
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

const [configDir, sessionID, prompt, envJSON, systemPrompt] = process.argv.slice(2),
  cwd = resolve(import.meta.dir);

if (!configDir || !sessionID || !prompt || !envJSON || !systemPrompt) {
  throw new Error('usage: crash-turn.ts <config-dir> <session-id> <prompt> <env-json> <system-prompt>');
}

let hasPrintedText = false;

for await (const message of query({
  options: {
    cwd,
    env: JSON.parse(envJSON) as Record<string, string>,
    includePartialMessages: true,
    maxTurns: 1,
    model: 'claude-haiku-4-5-20251001',
    resume: sessionID,
    settingSources: [],
    systemPrompt,
    tools: [],
  },
  prompt,
})) {
  if (message.type === 'system' && message.subtype === 'compact_boundary') {
    console.log(`event compact_boundary ${JSON.stringify(message.compact_metadata)}`);
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
