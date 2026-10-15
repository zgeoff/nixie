import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of a second writer: process A runs, and process B starts on the same data directory. The
// restore command, which a third variant runs in place of B, is not built yet.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it refuses a second process while the first holds the writer lock, and lets it start once the first is gone', async () => {
  const ctx = await setupTest();

  const processA = ctx.nixie.harness.start();

  await processA.ready;

  const epochBefore = await ctx.nixie.readRows('writer_epoch');
  const recordsBefore = await ctx.nixie.readRecords();

  const refused = ctx.nixie.harness.start();

  const refusedExit = await refused.exited;
  const epochAfterRefusal = await ctx.nixie.readRows('writer_epoch');
  const recordsAfterRefusal = await ctx.nixie.readRecords();

  // A carries on
  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void processA.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await processA.kill();

  const processB = ctx.nixie.harness.start([{ point: 'recovery.step.5' }]);

  const arrival = await processB.waitForArrival('recovery.step.5');

  processB.release(arrival);

  await processB.ready;

  const epochAfterB = await ctx.nixie.readRows('writer_epoch');

  await processB.kill();

  const oracle = await runOracle(ctx.nixie);

  expect(refusedExit.code).not.toBe(0);
  expect(refused.readStderr()).toInclude('writer lock held by another process');
  expect(epochAfterRefusal).toStrictEqual(epochBefore);
  expect(recordsAfterRefusal).toStrictEqual(recordsBefore);
  expect(epochAfterB).toStrictEqual([{ id: 1, epoch: 2 }]);

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

test('it refuses a second process while the first is frozen, and the first resumes after SIGCONT', async () => {
  const ctx = await setupTest();

  const processA = ctx.nixie.harness.start();

  await processA.ready;

  const epochBefore = await ctx.nixie.readRows('writer_epoch');

  processA.signal('SIGSTOP');

  const refused = ctx.nixie.harness.start();

  const refusedExit = await refused.exited;
  const epochAfterRefusal = await ctx.nixie.readRows('writer_epoch');

  processA.signal('SIGCONT');
  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void processA.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await processA.kill();

  const oracle = await runOracle(ctx.nixie);

  expect(refusedExit.code).not.toBe(0);
  expect(refused.readStderr()).toInclude('writer lock held by another process');
  expect(epochAfterRefusal).toStrictEqual(epochBefore);

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
