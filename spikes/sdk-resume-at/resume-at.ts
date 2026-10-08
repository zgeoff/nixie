// Checks whether a session can resume or fork from a given message, dropping the turns after it.
// Usage: bun --env-file=../../.env resume-at.ts <config-dir>
import { resolve } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { forkSession, getSessionMessages, query } from '@anthropic-ai/claude-agent-sdk';

interface TurnResult {
  answer: string;
  lastUuid: string | undefined;
  sessionId: string | undefined;
}

interface Turn {
  abortAfterMs?: number;
  extra: Partial<Options>;
  label: string;
  prompt: string;
}

const ask = 'What is the code word? Answer with the word only.',
  configDir = process.argv.at(2),
  cwd = resolve(import.meta.dir);

if (!configDir) {
  throw new Error('usage: resume-at.ts <config-dir>');
}

// forkSession() and getSessionMessages() read sessions in this process, so they need the directory.
process.env.CLAUDE_CONFIG_DIR = configDir;

function buildOptions(extra: Partial<Options>): Options {
  return {
    cwd,
    env: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '',
      CLAUDE_CONFIG_DIR: configDir,
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
  } else if (message.type === 'result' && message.subtype !== 'success') {
    result.answer += `[result ${message.subtype}]`;
  }
}

async function runTurn(turn: Turn): Promise<TurnResult> {
  const abortController = new AbortController(),
    result: TurnResult = { answer: '', lastUuid: undefined, sessionId: undefined },
    timer =
      turn.abortAfterMs === undefined
        ? undefined
        : setTimeout(() => abortController.abort(), turn.abortAfterMs);
  try {
    for await (const message of query({
      options: buildOptions({ ...turn.extra, abortController }),
      prompt: turn.prompt,
    })) {
      collect(result, message);
    }
  } catch (error) {
    console.log(`${turn.label}: stopped (${String(error).slice(0, 80)})`);
  } finally {
    clearTimeout(timer);
  }
  console.log(
    `${turn.label}: session=${result.sessionId} lastUuid=${result.lastUuid} answer=${JSON.stringify(result.answer.trim())}`,
  );
  return result;
}

async function printChain(label: string, sessionId: string): Promise<void> {
  const messages = await getSessionMessages(sessionId, { dir: cwd });
  console.log(
    `${label}: ${messages.length} messages, types ${messages.map((entry) => entry.type).join(',')}`,
  );
}

async function runForks(sessionId: string, keptUuid: string | undefined): Promise<void> {
  // A: resume at turn 1's last message, forked so the original stays intact.
  await runTurn({
    extra: { forkSession: true, resume: sessionId, resumeSessionAt: keptUuid },
    label: 'A resumeSessionAt+fork',
    prompt: ask,
  });

  // B: forkSession() up to turn 1's last message, then a plain resume of the fork.
  const fork = await forkSession(sessionId, { dir: cwd, upToMessageId: keptUuid });
  await printChain('fork B', fork.sessionId);
  await runTurn({ extra: { resume: fork.sessionId }, label: 'B forkSession+resume', prompt: ask });
}

async function runAbort(sessionId: string, keptUuid: string | undefined): Promise<void> {
  // C: a turn aborted mid-answer, then a resume at turn 1's last message.
  await runTurn({
    abortAfterMs: 1500,
    extra: { resume: sessionId },
    label: 'turn 3 aborted',
    prompt: 'The code word is now CHERRY. Write a 300-word story that uses it, then confirm.',
  });
  await printChain('original after aborted turn', sessionId);
  await runTurn({
    extra: { forkSession: true, resume: sessionId, resumeSessionAt: keptUuid },
    label: 'C resumeSessionAt after abort',
    prompt: ask,
  });
  await printChain('original at end', sessionId);
}

async function run(): Promise<void> {
  // Turn 1 is the committed turn; turn 2 is the turn a crash would leave behind.
  const first = await runTurn({
      extra: {},
      label: 'turn 1',
      prompt: 'The code word is APPLE. Reply with OK only.',
    }),
    sessionId = first.sessionId ?? '';
  await runTurn({
    extra: { resume: sessionId },
    label: 'turn 2',
    prompt: 'The code word is now BANANA. Reply with OK only.',
  });
  await printChain('original after turn 2', sessionId);
  await runForks(sessionId, first.lastUuid);
  await runAbort(sessionId, first.lastUuid);

  // Control: a plain resume of the original keeps every turn.
  await runTurn({ extra: { resume: sessionId }, label: 'control plain resume', prompt: ask });
}

await run();
