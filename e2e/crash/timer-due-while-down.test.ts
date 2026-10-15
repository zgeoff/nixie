import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of a timer that falls due while nixie is down: a test task's first step sets a durable
// timer an hour on, at 4,600,000 ms, and waits.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it fires a timer that fell due while nixie was down once, into the task inbox', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();
  await ctx.nixie.harness.advance(3_700_000);

  // holds the restart after its last recovery step, before any runner claims the task
  const second = ctx.nixie.harness.start([{ point: 'recovery.step.5' }]);

  const recovered = await second.waitForArrival('recovery.step.5');
  const tasksAfterRecovery = await ctx.nixie.readRows('tasks');

  second.release(recovered);

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const fired = records.filter((record) => record.kind === 'timer.fired');

  const oracle = await runOracle(ctx.nixie);

  expect(fired.map((record) => record.payload)).toStrictEqual([
    { timerID: expect.any(String), taskID, dueAt: 4_600_000, firedAt: 4_700_000 },
  ]);

  expect(tasksAfterRecovery).toPartiallyContain({ task_id: taskID, state: 'ready' });

  expect(
    records.filter((record) => record.kind === 'test.inbox_read').map((record) => record.payload),
  ).toStrictEqual([
    { taskID, sequences: [] },
    { taskID, sequences: [fired[0]?.sequence] },
  ]);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);

test('it leaves the timer unfired when nixie dies before the fire commits, and fires it once on the next restart', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();
  await ctx.nixie.harness.advance(3_700_000);

  const second = ctx.nixie.harness.start([{ point: 'timer.fire.before', workID: taskID }]);

  await second.waitForArrival('timer.fire.before', taskID);
  await second.kill();

  const timersAfterKill = await ctx.nixie.readRows('timers');

  const third = ctx.nixie.harness.start();

  await third.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await third.kill();

  const records = await ctx.nixie.readRecords();

  const fired = records.filter((record) => record.kind === 'timer.fired');

  const oracle = await runOracle(ctx.nixie);

  expect(timersAfterKill).toMatchObject([{ task_id: taskID, fired_at: null }]);

  expect(fired.map((record) => record.payload)).toStrictEqual([
    { timerID: expect.any(String), taskID, dueAt: 4_600_000, firedAt: 4_700_000 },
  ]);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);
