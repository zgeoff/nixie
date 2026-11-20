import { expect, test } from 'bun:test';
import { buildBootSeeder } from './build-seeder';
import { runOracle } from './run-oracle';
import { startSpawnedNixie } from './start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie, seed: buildBootSeeder(nixie) };
}

test('it finds nothing wrong in a log that nixie wrote', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();

  const oracle = await runOracle(ctx.nixie);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});

test('it reports a projection table whose rows a fold of the log does not rebuild', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();
  await ctx.seed.driftedTask(taskID);

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.projectionDrift).toStrictEqual(['tasks']);
});

test('it reports a provider call that no attempt of an action made', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();

  ctx.nixie.provider.addReplies({ kind: 'success', result: {} });

  await fetch(`${ctx.nixie.provider.url}/send`, {
    method: 'POST',
    headers: { 'idempotency-key': 'action-nobody-queued' },
    body: '{}',
  });

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayCalls).toStrictEqual(['action-nobody-queued']);
});

test('it reports a provider call without an idempotency key', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();

  ctx.nixie.provider.addReplies({ kind: 'success', result: {} });

  await fetch(`${ctx.nixie.provider.url}/send`, { method: 'POST', body: '{}' });

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayCalls).toStrictEqual([null]);
});

test('it reports a lease that is still held once recovery ran', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();
  await ctx.seed.goneHolderLease(taskID);

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.heldLeases).toStrictEqual([`1:task:${taskID}`]);
});

test('it reports a reply that no void names in a step that never committed', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();
  await ctx.seed.strayReply(taskID);

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayReplies).toStrictEqual([expect.any(Number)]);
});

test('it reports a reply of a failed attempt that no void names when a retry committed', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.kind === 'task.step_committed');
  await first.kill();
  await ctx.seed.strayReply(taskID, `${taskID}:1@0`);

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayReplies).toStrictEqual([expect.any(Number)]);
});
