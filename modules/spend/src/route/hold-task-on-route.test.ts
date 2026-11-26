import { expect, test } from 'bun:test';
import {
  spendRouteStoppedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { sql } from 'kysely';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { startTestSpend } from '../test-utils';
import { holdTaskOnRoute } from './hold-task-on-route';

async function setupTest() {
  const spend = await startTestSpend();

  return {
    ...spend,
    stopRoute: (route: string) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, spend.log, [
          {
            kind: spendRouteStoppedCodec.kind,
            definitions: spend.context.definitions(),
            payload: spendRouteStoppedCodec.encode({
              route,
              period: 'day',
              limit: 40,
              spent: 41,
              at: 1,
              resetsAt: 2,
            }),
          },
        ]),
      ),
  };
}

test('it holds the task while its route stands stopped', async () => {
  const ctx = await setupTest();

  await ctx.stopRoute('plan');

  const isHeld = await holdTaskOnRoute(ctx.context, 'task-a', 'plan');
  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');

  expect([isHeld, holds.map((hold) => hold.taskID)]).toStrictEqual([true, ['task-a']]);
});

test('it holds no task on a route with no stop', async () => {
  const ctx = await setupTest();

  await ctx.stopRoute('metered');

  const isHeld = await holdTaskOnRoute(ctx.context, 'task-a', 'plan');
  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');

  expect([isHeld, holds]).toStrictEqual([false, []]);
});

test('it writes one record for a task that it already holds on the route', async () => {
  const ctx = await setupTest();

  await ctx.stopRoute('plan');

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');
  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  const result =
    await sql`select count(*) as held from records where kind = 'spend.route_held'`.execute(
      ctx.writer.db,
    );

  expect(result.rows).toStrictEqual([{ held: 1 }]);
});
