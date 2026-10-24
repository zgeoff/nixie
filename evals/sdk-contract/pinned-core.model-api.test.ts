import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { runContractQuery } from '../test-utils/run-contract-query';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-pinned-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: [],
    maxTurns: 1,
    settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
    env: buildContractEnv(process.env, directory),
  };

  return { options };
}

test.skipIf(!isContractRun)(
  'it answers from a changed system prompt on a resume that turns the snapshot off',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: "What is the owner's code word? Answer with the word only.",
      options: {
        ...ctx.options,
        systemPrompt: {
          type: 'custom',
          prompt: "Pinned memory: the owner's code word is APPLE.",
          snapshot: false,
        },
      },
    });

    const sessionID = first.messages.at(-1)?.session_id;

    invariant(sessionID !== undefined);

    const run = await runContractQuery({
      prompt: "What is the owner's code word now? Answer with the word only.",
      options: {
        ...ctx.options,
        resume: sessionID,
        systemPrompt: {
          type: 'custom',
          prompt: "Pinned memory: the owner's code word is BANANA.",
          snapshot: false,
        },
      },
    });

    const result = run.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('BANANA');
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it answers from the recorded system prompt on a resume that keeps the default snapshot',
  async () => {
    const ctx = await setupTest();

    const first = await runContractQuery({
      prompt: "What is the owner's code word? Answer with the word only.",
      options: { ...ctx.options, systemPrompt: "Pinned memory: the owner's code word is APPLE." },
    });

    const sessionID = first.messages.at(-1)?.session_id;

    invariant(sessionID !== undefined);

    const run = await runContractQuery({
      prompt: "What is the owner's code word now? Answer with the word only.",
      options: {
        ...ctx.options,
        resume: sessionID,
        systemPrompt: "Pinned memory: the owner's code word is BANANA.",
      },
    });

    const result = run.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('APPLE');
  },
  120_000,
);
