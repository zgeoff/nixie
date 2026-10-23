import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { runOracle } from '../test-utils/run-oracle';
import { startSpawnedNixie } from '../test-utils/start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it commits a step that finishes inside the grace window once, and claims no new step', async () => {
  const ctx = await setupTest();

  const nixie = ctx.nixie.harness.start([{ point: 'sigterm.grace', kind: 'pool' }]);
  const reply = Promise.withResolvers<void>();

  await nixie.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.', gate: reply.promise });
  void nixie.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await waitForCondition(() =>
    ctx.nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );

  nixie.signal('SIGTERM');

  const grace = await nixie.waitForArrival('sigterm.grace');
  const created = await nixie.request('createTask', { brief: 'Start after the stop.' });

  const taskID = String(created);

  nixie.release(grace);
  reply.resolve();

  const exit = await nixie.exited;
  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(exit).toStrictEqual({ code: 0, signal: null });

  expect(
    records
      .filter((record) => record.kind === 'task.step_committed' && record.thread === 'conversation')
      .map((record) => record.stepKey),
  ).toStrictEqual(['conversation:1']);

  expect(
    records.filter((record) => record.kind === 'task.step_started' && record.thread === taskID),
  ).toStrictEqual([]);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});

test('it stops with a step still running at the deadline, which the restart recovers as after a crash', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'sigterm.grace', kind: 'pool' }]);

  await first.ready;

  ctx.nixie.model.addReplies(
    { text: 'Late.', gate: Promise.withResolvers<void>().promise },
    { text: 'Hi.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await waitForCondition(() =>
    ctx.nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );

  first.signal('SIGTERM');

  const arrival = await first.waitForArrival('sigterm.grace');

  first.release(arrival);

  await ctx.nixie.harness.advance(30_000);

  const exit = await first.exited;

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(exit).toStrictEqual({ code: 0, signal: null });

  expect(
    records
      .filter(
        (record) =>
          record.thread === 'conversation' &&
          [
            'task.step_started',
            'task.lease_expired',
            'task.step_interrupted',
            'task.step_committed',
          ].includes(record.kind),
      )
      .map((record) => record.kind),
  ).toStrictEqual([
    'task.step_started',
    'task.lease_expired',
    'task.step_interrupted',
    'task.step_started',
    'task.step_committed',
  ]);

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
});
