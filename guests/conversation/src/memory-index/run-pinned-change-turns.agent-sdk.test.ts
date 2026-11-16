import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubContractEnv } from '../test-utils/build-stub-contract-env';
import { startStubModel } from '../test-utils/start-stub-model';
import { pinnedChangeAnswers, runPinnedChangeTurns } from './run-pinned-change-turns';

async function setupTest() {
  const model = startStubModel();

  onTestFinished(() => model.stop());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-pinned-change-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    model,
    target: { directory, env: buildStubContractEnv(process.env, model.url, directory) },
    readMessageCalls: () => model.requests.filter((request) => request.path === '/v1/messages'),
  };
}

test('it sends the memory index on the first turn and keeps it on each resume', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(...pinnedChangeAnswers.map((text) => ({ text })));

  await runPinnedChangeTurns(ctx.target, 'test-model-1');

  const bodies = ctx.readMessageCalls().map((request) => JSON.stringify(request.body?.messages));

  expect(bodies.map((body) => body.includes(String.raw`type=\"memory-index\"`))).toStrictEqual([
    true,
    true,
    true,
    true,
    true,
  ]);
});

test('it sends each changed value on its own turn, and no change on a turn without one', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(...pinnedChangeAnswers.map((text) => ({ text })));

  await runPinnedChangeTurns(ctx.target, 'test-model-1');

  const bodies = ctx.readMessageCalls().map((request) => JSON.stringify(request.body?.messages));

  expect(bodies.map((body) => body.split('code word is ').length - 1)).toStrictEqual([
    1, 2, 2, 3, 3,
  ]);

  expect(bodies.at(-1)).toContain('code word is CHERRY');
});

test('it offers the memory tools to the model', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(...pinnedChangeAnswers.map((text) => ({ text })));

  await runPinnedChangeTurns(ctx.target, 'test-model-1');

  const [first] = ctx.readMessageCalls();

  expect(JSON.stringify(first?.body?.tools)).toContain('mcp__nixie__memory_recall');
});

test('it returns one run for the opening turn and one for each later turn', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(...pinnedChangeAnswers.map((text) => ({ text })));

  const runs = await runPinnedChangeTurns(ctx.target, 'test-model-1');

  expect(runs).toHaveLength(pinnedChangeAnswers.length);
});
