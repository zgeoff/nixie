/* oxlint-disable one-var -- a throwaway spike */
// Checks when a change to the system prompt, where the pinned memory core would live, reaches a
// resumed session, and what each change costs the prompt cache.
// Usage: bun --env-file=../../.env pinned-core.ts <config-dir>
import { resolve } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

interface TurnResult {
  answer: string;
  cacheRead: number;
  cacheWrite: number;
  lastUuid: string | undefined;
  sessionId: string | undefined;
}

const ask = "What is the owner's code word? Answer with the word only.",
  configDir = process.argv.at(2),
  cwd = resolve(import.meta.dir);

// Enough stable text that the prompt crosses the cache minimum length.
const filler = Array.from(
  { length: 300 },
  (_, index) => `Standing note ${index}: keep replies short and plain.`,
).join('\n');

if (!configDir) {
  throw new Error('usage: pinned-core.ts <config-dir>');
}

function buildCore(word: string): string {
  return `${filler}\n\nPinned memory: the owner's code word is ${word}.`;
}

function buildOptions(extra: Partial<Options>): Options {
  return {
    cwd,
    env: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      CLAUDE_CONFIG_DIR: configDir ?? '',
      HOME: process.env.HOME ?? '',
      PATH: process.env.PATH ?? '',
    },
    maxTurns: 1,
    model: 'claude-haiku-4-5-20251001',
    settingSources: [],
    tools: [],
    ...extra,
  };
}

function collect(result: TurnResult, message: SDKMessage): void {
  if ('session_id' in message && message.session_id) {
    result.sessionId = message.session_id;
  }
  if (message.type === 'assistant') {
    result.lastUuid = message.uuid;
    for (const block of message.message.content) {
      if (block.type === 'text') {
        result.answer += block.text;
      }
    }
  } else if (message.type === 'result') {
    result.cacheRead = message.usage.cache_read_input_tokens ?? 0;
    result.cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  }
}

async function runTurn(label: string, extra: Partial<Options>, prompt = ask): Promise<TurnResult> {
  const result: TurnResult = {
    answer: '',
    cacheRead: 0,
    cacheWrite: 0,
    lastUuid: undefined,
    sessionId: undefined,
  };
  for await (const message of query({ options: buildOptions(extra), prompt })) {
    collect(result, message);
  }
  console.log(
    `${label}: answer=${JSON.stringify(result.answer.trim())} cacheRead=${result.cacheRead} cacheWrite=${result.cacheWrite} session=${result.sessionId?.slice(0, 8)}`,
  );
  return result;
}

async function run(): Promise<void> {
  const first = await runTurn('1 new session, APPLE', { systemPrompt: buildCore('APPLE') }),
    sessionId = first.sessionId ?? '';
  await runTurn('2 resume, same prompt', { resume: sessionId, systemPrompt: buildCore('APPLE') });
  await runTurn('3 resume, BANANA, default snapshot', {
    resume: sessionId,
    systemPrompt: buildCore('BANANA'),
  });
  await runTurn('4 resume, BANANA, snapshot false', {
    resume: sessionId,
    systemPrompt: { prompt: buildCore('BANANA'), snapshot: false, type: 'custom' },
  });
  await runTurn('5 resume, BANANA, snapshot false again', {
    resume: sessionId,
    systemPrompt: { prompt: buildCore('BANANA'), snapshot: false, type: 'custom' },
  });
  await runTurn('6 fork at turn 1, CHERRY, default snapshot', {
    forkSession: true,
    resume: sessionId,
    resumeSessionAt: first.lastUuid,
    systemPrompt: buildCore('CHERRY'),
  });
  await runTurn('7 resume original, CHERRY, default snapshot', {
    resume: sessionId,
    systemPrompt: buildCore('CHERRY'),
  });
}

await run();
