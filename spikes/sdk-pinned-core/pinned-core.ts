/* oxlint-disable one-var -- a throwaway spike */
// Checks when a changed system prompt, where the pinned core would live, reaches a resumed session.
// Usage: pass the vault token as CLAUDE_CODE_OAUTH_TOKEN, then
// bun pinned-core.ts <config-dir> [--variant base|note|note-only]
import { resolve } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readProvider } from './provider.ts';

interface TurnResult {
  answer: string;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  lastUuid: string | undefined;
  sessionId: string | undefined;
}

const ask = "What is the owner's code word? Answer with the word only.",
  configDir = process.argv.at(2),
  cwd = resolve(import.meta.dir),
  variant = process.argv.includes('--variant')
    ? process.argv[process.argv.indexOf('--variant') + 1]
    : 'base';

// Enough stable text that the prompt crosses the cache minimum length.
const filler = Array.from(
  { length: 300 },
  (_, index) => `Standing note ${index}: keep replies short and plain.`,
).join('\n');

if (!configDir) {
  throw new Error('usage: pinned-core.ts <config-dir>');
}

function buildCoreLine(word: string): string {
  return `Pinned memory: the owner's code word is ${word}.`;
}

function buildCore(word: string): string {
  return `${filler}\n\n${buildCoreLine(word)}`;
}

// The note a turn carries when the core changed since the session's last turn.
function buildNote(word: string): string {
  return `<system-reminder>\nYour pinned memory changed. Current: ${buildCoreLine(word)}\n</system-reminder>\n\n${ask}`;
}

const provider = readProvider();

function buildOptions(extra: Partial<Options>): Options {
  return {
    cwd,
    env: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ...provider.env,
      CLAUDE_CONFIG_DIR: configDir ?? '',
      HOME: configDir ?? '',
      PATH: process.env.PATH ?? '',
    },
    maxTurns: 1,
    model: provider.model,
    settingSources: [],
    settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
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
    result.input = message.usage.input_tokens + result.cacheRead + result.cacheWrite;
  }
}

async function runTurn(label: string, extra: Partial<Options>, prompt = ask): Promise<TurnResult> {
  const result: TurnResult = {
    answer: '',
    cacheRead: 0,
    cacheWrite: 0,
    input: 0,
    lastUuid: undefined,
    sessionId: undefined,
  };
  for await (const message of query({ options: buildOptions(extra), prompt })) {
    collect(result, message);
  }
  console.log(
    `${label}: answer=${JSON.stringify(result.answer.trim())} cacheRead=${result.cacheRead} cacheWrite=${result.cacheWrite} input=${result.input} session=${result.sessionId?.slice(0, 8)}`,
  );
  return result;
}

// Turns 4 and 5 of a variant: the note on the first changed turn, then a plain resume.
async function runVariant(sessionId: string): Promise<void> {
  const changed = variant === 'note-only' ? 'APPLE' : 'BANANA',
    label = variant === 'note-only' ? 'APPLE prompt' : 'BANANA, snapshot false';
  await runTurn(
    `4 resume, ${label}, note BANANA`,
    {
      resume: sessionId,
      systemPrompt: { prompt: buildCore(changed), snapshot: false, type: 'custom' },
    },
    buildNote('BANANA'),
  );
  await runTurn(`5 resume, ${label}, no note`, {
    resume: sessionId,
    systemPrompt: { prompt: buildCore(changed), snapshot: false, type: 'custom' },
  });
}

async function run(): Promise<void> {
  const first = await runTurn('1 new session, APPLE', { systemPrompt: buildCore('APPLE') }),
    sessionId = first.sessionId ?? '';
  await runTurn('2 resume, same prompt', { resume: sessionId, systemPrompt: buildCore('APPLE') });
  await runTurn('3 resume, BANANA, default snapshot', {
    resume: sessionId,
    systemPrompt: buildCore('BANANA'),
  });
  if (variant !== 'base') {
    await runVariant(sessionId);
    return;
  }
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

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Pinned-core spike failed.';
  console.error(message);
  process.exitCode = 1;
}
