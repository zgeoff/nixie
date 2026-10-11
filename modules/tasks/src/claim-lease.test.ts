import { expect, onTestFinished, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { claimLease } from './claim-lease';
import { resetLease } from './reset-lease';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointContext, FaultPointID, TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();
  const claimWork = (holder: string) =>
    claimLease(tasks.context, {
      kind: 'action',
      holder,
      durationMs: 60_000,
      findCandidate: () => Promise.resolve('work-1'),
    });

  return { ...tasks, claimWork };
}

test('it claims free work at generation 1 under the writer epoch, for one lease length', async () => {
  const ctx = await setupTest();

  const lease = await ctx.claimWork('runner-a');

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

  await ctx.claimWork('runner-a');
  ctx.clock.advance(59_999);

  const lease = await ctx.claimWork('runner-b');

  expect(lease).toBeNull();
});

test('it claims work whose lease expired at the next generation', async () => {
  const ctx = await setupTest();

  await ctx.claimWork('runner-a');
  ctx.clock.advance(60_000);

  const lease = await ctx.claimWork('runner-b');

  expect(lease).toMatchObject({ holder: 'runner-b', generation: 2, expiresAt: 1_120_000 });
});

test('it claims work whose lease was reset at the next generation', async () => {
  const ctx = await setupTest();

  const first = await ctx.claimWork('runner-a');

  if (first === null) {
    throw new Error('the first claim found no work');
  }
  await withWriteTransaction(ctx.writer, (tx) => resetLease(tx, first));

  const lease = await ctx.claimWork('runner-b');

  expect(lease).toMatchObject({ holder: 'runner-b', generation: 2 });
});

test('it stores the lease it returns', async () => {
  const ctx = await setupTest();

  await ctx.claimWork('runner-a');

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
    findCandidate: () => Promise.resolve(null),
  });

  expect(lease).toBeNull();
});

test('it rolls the lease back when the claim records fail', async () => {
  const ctx = await setupTest();

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    findCandidate: () => Promise.resolve('work-1'),
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

  await ctx.claimWork('runner-a');

  expect(reached).toStrictEqual([{ id: 'claim.after', context: { kind: 'action', id: 'work-1' } }]);
});
