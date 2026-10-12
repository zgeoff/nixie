import { expect, test } from 'bun:test';
import { buildAdvanceHelpers } from './build-advance-helpers';
import { startTestNixie } from './start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('#advanceUntilRecord advances the clock until the record that a later advance brings shows', async () => {
  const ctx = await setupTest();
  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });
  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);

  const helpers = buildAdvanceHelpers(ctx.nixie.harness, ctx.nixie.readRecords, {
    advanceWaitMs: 1000,
    lastAdvanceWaitMs: 10_000,
  });
  const fired = await helpers.advanceUntilRecord(
    1_800_000,
    3,
    (record) => record.kind === 'timer.fired',
  );

  expect(fired.payload).toStrictEqual({
    timerID: expect.any(String),
    taskID,
    dueAt: 4_600_000,
    firedAt: 4_600_000,
  });
}, 60_000);

test('#advanceUntilRecord throws after its last advance when no record matches', async () => {
  const ctx = await setupTest();
  const helpers = buildAdvanceHelpers(ctx.nixie.harness, () => Promise.resolve([]), {
    advanceWaitMs: 10,
    lastAdvanceWaitMs: 50,
  });

  const advance = helpers.advanceUntilRecord(1000, 2, () => true);

  expect(advance).rejects.toThrowWithMessage(
    Error,
    'nothing arrived after the last advance of 1000 ms',
  );
});

test('#advanceUntilArrival advances the clock until nixie arrives at the fault point', async () => {
  const ctx = await setupTest();
  const first = ctx.nixie.harness.start([{ point: 'timer.fire.before' }]);

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });
  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);

  const helpers = buildAdvanceHelpers(ctx.nixie.harness, ctx.nixie.readRecords, {
    advanceWaitMs: 1000,
    lastAdvanceWaitMs: 10_000,
  });
  const arrival = await helpers.advanceUntilArrival(first, 'timer.fire.before', {
    stepMs: 1_800_000,
    maxSteps: 3,
  });

  expect(arrival).toMatchObject({ point: 'timer.fire.before', work: { id: taskID } });
}, 60_000);

test('#advanceUntilArrival throws after its last advance when nixie never arrives', async () => {
  const ctx = await setupTest();
  const first = ctx.nixie.harness.start([{ point: 'timer.fire.before' }]);

  await first.ready;

  const helpers = buildAdvanceHelpers(ctx.nixie.harness, ctx.nixie.readRecords, {
    advanceWaitMs: 10,
    lastAdvanceWaitMs: 50,
  });

  const advance = helpers.advanceUntilArrival(first, 'timer.fire.before', {
    stepMs: 1000,
    maxSteps: 2,
  });

  expect(advance).rejects.toThrowWithMessage(
    Error,
    'nothing arrived after the last advance of 1000 ms',
  );
}, 60_000);
