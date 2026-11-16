import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { runMemoryIndexProbe } from './run-memory-index-probe';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-probe-memory-index-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
  };
}

test('it sends the memory index on the first turn and each changed value on a later resume', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });

  await runMemoryIndexProbe(ctx.target);

  const bodies = ctx.model.requests
    .filter((request) => request.path === '/v1/messages')
    .map((request) => JSON.stringify(request.body?.messages));

  expect(bodies.map((body) => body.includes(String.raw`type=\"memory-index\"`))).toStrictEqual([
    true,
    true,
    true,
  ]);

  expect(bodies.at(-1)?.includes('code word is CHERRY')).toBe(true);
});

test('it returns one run for the opening turn and one for each changed value', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });

  const runs = await runMemoryIndexProbe(ctx.target);

  expect(runs).toHaveLength(3);
});
