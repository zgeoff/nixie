import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runPinnedCoreProbe } from './run-pinned-core-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-pinned-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it sends the changed system prompt on a resume that turns the snapshot off', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await runPinnedCoreProbe(ctx.target, 'off');

  const resumed = ctx.model.requests.findLast((request) => request.path === '/v1/messages');
  const system = JSON.stringify(resumed?.body?.system);

  expect([
    system.includes('code word is APPLE'),
    system.includes('code word is BANANA'),
  ]).toStrictEqual([false, true]);
});

test('it sends the recorded system prompt on a resume that keeps the default snapshot', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'APPLE' });

  await runPinnedCoreProbe(ctx.target, 'default');

  const resumed = ctx.model.requests.findLast((request) => request.path === '/v1/messages');
  const system = JSON.stringify(resumed?.body?.system);

  expect([
    system.includes('code word is APPLE'),
    system.includes('code word is BANANA'),
  ]).toStrictEqual([true, false]);
});
