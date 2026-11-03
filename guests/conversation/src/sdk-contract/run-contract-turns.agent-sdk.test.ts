import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { buildProbeOptions } from './build-probe-options';
import { runContractTurns } from './run-contract-turns';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-turns-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    options: buildProbeOptions({
      directory,
      env: buildStubContractEnv(process.env, model.url, directory),
    }),
  };
}

test('it runs each prompt as a turn of one session, each after the result of the one before', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'first reply' }, { text: 'second reply' });

  const run = await runContractTurns({
    prompts: ['Say the first reply.', 'Say the second reply.'],
    options: ctx.options,
  });

  const results = run.messages.flatMap((message) =>
    message.type === 'result' && message.subtype === 'success' ? [message] : [],
  );

  expect(results.map((result) => result.result)).toStrictEqual(['first reply', 'second reply']);
  expect(new Set(results.map((result) => result.session_id)).size).toBe(1);
  expect(run.thrown).toBeNull();
});

test('it passes each streamed message to the caller', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'only reply' });

  const seen: string[] = [];

  const run = await runContractTurns({
    prompts: ['Say the reply.'],
    options: ctx.options,

    onMessage: (message) => {
      seen.push(message.type);
    },
  });

  expect(seen).toStrictEqual(run.messages.map((message) => message.type));
});
