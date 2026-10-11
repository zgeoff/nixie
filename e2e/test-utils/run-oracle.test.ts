import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '../../libs/db/src/index';
import type { TasksTables } from '../../modules/tasks/src/index';
import { runOracle } from './run-oracle';
import { startTestNixie } from './start-test-nixie';

// a nixie that ran one step of a test task, then died
async function setupTest() {
  const nixie = await startTestNixie();
  const process = nixie.harness.start();

  await process.ready;

  const created = await process.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await process.kill();

  return { nixie };
}

test('it finds nothing wrong in a log that nixie wrote', async () => {
  const ctx = await setupTest();

  const oracle = await runOracle(ctx.nixie);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActionIDs: [],
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
