import { expect, test } from 'bun:test';
import { waitForCondition } from '../../libs/testing/src/index';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of a stale writer epoch: process A loses its writer lock through a test-only hook, as a
// bug would, while it runs a step, and process B takes the lock and raises the epoch.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it stops the stale writer at its first write, and the new writer expires its lease', async () => {
  const ctx = await setupTest();
  const processA = ctx.nixie.harness.start();
  const lateReply = Promise.withResolvers<void>();

  await processA.ready;

  // A's turn waits on a reply that comes only once B holds the lock, so its step still runs when B
  // starts and then tries to commit
  ctx.nixie.model.addReplies({ text: 'Late.', gate: lateReply.promise }, { text: 'Hi.' });
  void processA.request('sendMessage', { thread: 'conversation', text: 'Hello.' });
  await waitForCondition(() =>
    ctx.nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );
  await processA.request('releaseWriterLock', null);

  const processB = ctx.nixie.harness.start();

  await processB.ready;
  lateReply.resolve();

  const exitA = await processA.exited;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await processB.kill();

  const records = await ctx.nixie.readRecords();
  const startedByA = records.find(
    (record) => record.kind === 'task.step_started' && record.payload['generation'] === 1,
  );
  const expiredByB = records.find((record) => record.kind === 'task.lease_expired');

  const oracle = await runOracle(ctx.nixie);

  expect(exitA.code).not.toBe(0);
  expect(processA.readStderr()).toInclude('stale writer: writer epoch 1 is stale');
  expect(Number(startedByA?.sequence)).toBeLessThan(Number(expiredByB?.sequence));
  expect(
    records
      .filter((record) => record.kind === 'task.step_started')
      .map((record) => record.payload['generation']),
  ).toStrictEqual([1, 2]);
  expect(
    records
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual(['conversation:1']);
  expect(records.filter((record) => record.kind === 'model.reply')).toHaveLength(1);
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
