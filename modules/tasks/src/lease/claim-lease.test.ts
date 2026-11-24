import { expect, onTestFinished, test } from 'bun:test';
import { pauseNixieInTransaction, withWriteTransaction } from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { writeTaskControl } from '../task/write-task-control';
import { createTestTaskInState } from '../test-utils/create-test-task-in-state';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { FaultPointContext, FaultPointID, TasksTables } from '../types';
import { resetLease } from '../utils/reset-lease';
import { claimLease } from './claim-lease';
import { setFaultPointHandler } from './set-fault-point-handler';

function setupTest() {
  return startTestTasks();
}

test('it claims free work at generation 1 under the writer epoch, for one lease length', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  expect(lease).toStrictEqual({
    kind: 'action',
    workID: 'work-1',
    holder: 'runner-a',
    generation: 1,
    epoch: ctx.writer.epoch,
    expiresAt: 1_060_000,
  });
});

test('it refuses work whose lease another runner holds and has not expired', async () => {
  const ctx = await setupTest();

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  ctx.clock.advance(59_999);

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  expect(lease).toBeNull();
});

test('it claims work whose lease expired at the next generation', async () => {
  const ctx = await setupTest();

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  ctx.clock.advance(60_000);

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  expect(lease).toMatchObject({ holder: 'runner-b', generation: 2, expiresAt: 1_120_000 });
});

test('it claims work whose lease was reset at the next generation', async () => {
  const ctx = await setupTest();

  const first = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  invariant(first);

  await withWriteTransaction(ctx.writer, (tx) => resetLease(tx, first));

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  expect(lease).toMatchObject({ holder: 'runner-b', generation: 2 });
});

test('it stores the lease it returns', async () => {
  const ctx = await setupTest();

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  const rows = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .selectAll()
    .execute();

  expect(rows).toStrictEqual([
    {
      kind: 'action',
      work_id: 'work-1',
      holder: 'runner-a',
      expires_at: 1_060_000,
      epoch: ctx.writer.epoch,
      generation: 1,
    },
  ]);
});

test('it claims nothing when no work is claimable', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'task',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve(null),
  });

  expect(lease).toBeNull();
});

test('it rolls the lease back when the claim records fail', async () => {
  const ctx = await setupTest();

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
    onClaim: () => Promise.reject(new Error('the claim records failed')),
  }).catch(() => null);

  const rows = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .selectAll()
    .execute();

  expect(rows).toStrictEqual([]);
});

test('it reaches the claim.after fault point once the claim commits', async () => {
  const ctx = await setupTest();

  const reached: { id: FaultPointID; context: FaultPointContext }[] = [];

  setFaultPointHandler((id, context) => {
    reached.push({ id, context });
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  expect(reached.filter((arrival) => arrival.id === 'claim.after')).toStrictEqual([
    { id: 'claim.after', context: { kind: 'action', id: 'work-1' } },
  ]);
});

test('it reaches the claim.before fault point before it looks for work, also when it finds none', async () => {
  const ctx = await setupTest();

  const reached: { id: FaultPointID; context: FaultPointContext }[] = [];

  setFaultPointHandler((id, context) => {
    reached.push({ id, context });
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await claimLease(ctx.context, {
    kind: 'task',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve(null),
  });

  expect(reached).toStrictEqual([{ id: 'claim.before', context: { kind: 'task', id: null } }]);
});

test('it throws under the test build when a candidate query returns the work of a task that a nixie pause holds, and writes no lease', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.context.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: { snapshotHash: 'sha256:test' },
    }),
  );

  const claim = claimLease(ctx.context, {
    kind: 'task',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'task-1' }),
  });

  await Promise.allSettled([claim]);

  const leases = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select('work_id')
    .execute();

  expect(claim).rejects.toThrowWithMessage(
    Error,
    'a candidate query returned work work-1 of task task-1, which the task gate holds for nixie',
  );

  expect(leases).toStrictEqual([]);
});

test('it throws under the test build when a task claim returns a task at a standing spending stop', async () => {
  const ctx = await setupTest();

  await buildLogSeeder(ctx.context).spendStop();

  const claim = claimLease(ctx.context, {
    kind: 'task',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'task-1' }),
  });

  await Promise.allSettled([claim]);

  expect(claim).rejects.toThrowWithMessage(
    Error,
    'a candidate query returned work work-1 of task task-1, which the task gate holds for spend',
  );
});

test('it throws under the test build when an action claim returns an unstarted action of a paused task', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  const claim = claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'action-1', taskID: task.taskID }),
  });

  await Promise.allSettled([claim]);

  expect(claim).rejects.toThrowWithMessage(
    Error,
    `a candidate query returned work action-1 of task ${task.taskID}, which the task gate holds for task`,
  );
});

test('it claims the action with a started attempt of a paused task', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () =>
      Promise.resolve({ workID: 'action-1', taskID: task.taskID, isStarted: true }),
  });

  expect(lease).toMatchObject({ kind: 'action', workID: 'action-1' });
});

test('it refuses the action with a started attempt while nixie is paused, and writes no lease', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.context.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: { snapshotHash: 'sha256:test' },
    }),
  );

  const claim = claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () =>
      Promise.resolve({ workID: 'action-1', taskID: task.taskID, isStarted: true }),
  });

  await Promise.allSettled([claim]);

  expect(claim).rejects.toThrowWithMessage(
    Error,
    `a candidate query returned work action-1 of task ${task.taskID}, which the task gate holds for nixie`,
  );
});
