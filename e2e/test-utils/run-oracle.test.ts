import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import type { TasksTables } from '@heynixie/tasks';
import { runOracle } from './run-oracle';
import { startTestNixie } from './start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  const first = nixie.harness.start();

  await first.ready;

  // boot data: the oracle reads a log that nixie wrote, so one task commits a step before nixie dies
  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();

  return { nixie, taskID };
}

test('it finds nothing wrong in a log that nixie wrote', async () => {
  const ctx = await setupTest();
  const oracle = await runOracle(ctx.nixie);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 60_000);

test('it reports a projection table whose rows a fold of the log does not rebuild', async () => {
  const ctx = await setupTest();

  const db = startDatabase(join(ctx.nixie.dataDir, 'nixie.db'));

  onTestFinished(() => db.destroy());

  await db.$extendTables<TasksTables>().updateTable('tasks').set({ step_errors: 7 }).execute();

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.projectionDrift).toStrictEqual(['tasks']);
}, 60_000);

test('it reports a provider call that no attempt of an action made', async () => {
  const ctx = await setupTest();

  ctx.nixie.provider.addReplies({ kind: 'success', result: {} });

  await fetch(`${ctx.nixie.provider.url}/send`, {
    method: 'POST',
    headers: { 'idempotency-key': 'action-nobody-queued' },
    body: '{}',
  });

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayCalls).toStrictEqual(['action-nobody-queued']);
}, 60_000);

test('it reports a provider call without an idempotency key', async () => {
  const ctx = await setupTest();

  ctx.nixie.provider.addReplies({ kind: 'success', result: {} });

  await fetch(`${ctx.nixie.provider.url}/send`, { method: 'POST', body: '{}' });

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.strayCalls).toStrictEqual([null]);
}, 60_000);

test('it reports a lease that is still held once recovery ran', async () => {
  const ctx = await setupTest();

  const db = startDatabase(join(ctx.nixie.dataDir, 'nixie.db'));

  onTestFinished(() => db.destroy());

  // a lease under an epoch ahead of every writer, which no recovery frees
  await db
    .$extendTables<TasksTables>()
    .updateTable('leases')
    .set({ holder: 'nixie-gone', expires_at: 9_000_000, epoch: 999 })
    .where('work_id', '=', ctx.taskID)
    .execute();

  const oracle = await runOracle(ctx.nixie);

  expect(oracle.heldLeases).toStrictEqual([`1:task:${ctx.taskID}`]);
}, 60_000);
