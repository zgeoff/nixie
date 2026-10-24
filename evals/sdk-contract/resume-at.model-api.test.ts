import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { buildFiller } from '../test-utils/build-filler';
import { loadSessionTranscript } from '../test-utils/load-session-transcript';
import { runContractQuery } from '../test-utils/run-contract-query';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-resume-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    maxTurns: 1,
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    env: buildContractEnv(process.env, directory),
  };

  return { directory, options };
}

test.skipIf(!isContractRun)(
  'it answers from the boundary when a fork resumes at a message before a later turn',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: 'The code word is APPLE. Reply with OK only.',
      options: ctx.options,
    });

    const boundary = first.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    await runContractQuery({
      prompt: 'The code word is now BANANA. Reply with OK only.',
      options: { ...ctx.options, resume: boundary.session_id },
    });

    const before = await loadSessionTranscript(ctx.directory, boundary.session_id);

    const fork = await runContractQuery({
      prompt: 'What is the code word? Answer with the word only.',
      options: {
        ...ctx.options,
        resume: boundary.session_id,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    const result = fork.messages.at(-1);

    const after = await loadSessionTranscript(ctx.directory, boundary.session_id);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
    expect(result.session_id).not.toBe(boundary.session_id);
    expect(after).toStrictEqual(before);
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it answers from the boundary when a fork resumes at a message before an aborted turn',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: 'The code word is APPLE. Reply with OK only.',
      options: ctx.options,
    });

    const boundary = first.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    const abortController = new AbortController();

    const aborted = await runContractQuery({
      prompt: 'The code word is now CHERRY. Write a 300-word story that uses it, then confirm.',
      options: {
        ...ctx.options,
        resume: boundary.session_id,
        abortController,
        includePartialMessages: true,
      },

      onMessage: (message) => {
        if (message.type === 'stream_event') {
          abortController.abort();
        }
      },
    });

    const transcript = await loadSessionTranscript(ctx.directory, boundary.session_id);

    const fork = await runContractQuery({
      prompt: 'What is the code word? Answer with the word only.',
      options: {
        ...ctx.options,
        resume: boundary.session_id,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    const result = fork.messages.at(-1);

    expect(aborted.thrown).toInclude('aborted');
    expect(JSON.stringify(transcript)).toInclude('CHERRY');

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it refuses a resume at a boundary that a later compaction left out',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: `The code word is APPLE. Keep these tide notes for later.\n${buildFiller(12_000, 'part 1')}\nReply with OK only.`,
      options: ctx.options,
    });

    const sessionID = first.messages.at(-1)?.session_id;

    invariant(sessionID !== undefined);

    const second = await runContractQuery({
      prompt: `The code word is now BANANA. More tide notes.\n${buildFiller(12_000, 'part 2')}\nReply with OK only.`,
      options: { ...ctx.options, resume: sessionID },
    });

    const boundary = second.messages.findLast((message) => message.type === 'assistant');

    invariant(boundary);

    await runContractQuery({
      prompt: 'The code word is now CHERRY. Reply with OK only.',
      options: { ...ctx.options, resume: sessionID },
    });

    const compaction = await runContractQuery({
      prompt: '/compact',
      options: { ...ctx.options, resume: sessionID },
    });

    const run = await runContractQuery({
      prompt: 'What is the code word? Answer with the word only.',
      options: {
        ...ctx.options,
        resume: sessionID,
        resumeSessionAt: boundary.uuid,
        forkSession: true,
      },
    });

    expect(compaction.messages).toPartiallyContain({
      type: 'system',
      subtype: 'compact_boundary',
    });

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      errors: [expect.stringMatching(/^No message found with message\.uuid of: /u)],
    });
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it ends a resume of a session the config directory does not hold in an error result that names the missing session',
  async () => {
    const ctx = await setupTest();

    const sessionID = crypto.randomUUID();

    const run = await runContractQuery({
      prompt: 'What is the code word? Answer with the word only.',
      options: { ...ctx.options, resume: sessionID, forkSession: true },
    });

    expect(run.messages.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'error_during_execution',
      errors: [expect.stringMatching(/^No conversation found with session ID: /u)],
    });
  },
  120_000,
);
