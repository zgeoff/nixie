import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildModelGrant } from '@heynixie/models';
import invariant from 'tiny-invariant';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { runContractQuery } from '../test-utils/run-contract-query';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest(header: 'bearer' | 'x-api-key') {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-grant-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const grant = buildModelGrant({
    name: 'model-chat-1',
    value: 'not-a-real-key',
    host: 'api.anthropic.com',
    header,
  });

  const caller = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('ANTHROPIC_')),
  );

  return {
    options: {
      cwd: directory,
      model: 'claude-haiku-5-5',
      settingSources: [],
      tools: [],
      maxTurns: 1,
      settings: { autoMemoryEnabled: false, autoDreamEnabled: false },
      env: buildContractEnv({ ...caller, ...grant.env }, directory),
    },
  };
}

test.skipIf(!isContractRun).each(['bearer', 'x-api-key'] as const)(
  'it answers a turn whose %s credential is the model grant placeholder',
  async (header) => {
    const ctx = await setupTest(header);

    const run = await runContractQuery({
      prompt: 'Answer with the word READY only.',
      options: ctx.options,
    });

    const result = run.messages.at(-1);

    invariant(result?.type === 'result' && result.subtype === 'success');

    expect(result.result.trim()).toBe('READY');
  },
  7000,
);
