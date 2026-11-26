import { expect, test } from 'bun:test';
import {
  spendProviderStoppedCodec,
  spendRouteClearedCodec,
  spendRouteStoppedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { sql } from 'kysely';
import { readSpendProviderHolds } from '../stop/read-spend-provider-holds';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { startTestSpend } from '../test-utils';
import { holdTaskOnRoute } from './hold-task-on-route';

async function setupTest() {
  const spend = await startTestSpend();

  return {
    ...spend,
    stopProvider: (provider: string, routes: readonly string[]) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, spend.log, [
          {
            kind: spendProviderStoppedCodec.kind,
            definitions: spend.context.definitions(),
            payload: spendProviderStoppedCodec.encode({
              provider,
              routes: [...routes],
              period: 'day',
              limit: 100,
              spent: 101,
              at: 1,
              resetsAt: 2,
            }),
          },
        ]),
      ),
    clearRoute: (route: string) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, spend.log, [
          {
            kind: spendRouteClearedCodec.kind,
            definitions: spend.context.definitions(),
            payload: spendRouteClearedCodec.encode({ route, reason: 'raised' }),
          },
        ]),
      ),
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

test('it holds the task on its route while the provider of the route stands stopped', async () => {
  const ctx = await setupTest();

  await ctx.stopProvider('main', ['plan', 'metered']);

  const isHeld = await holdTaskOnRoute(ctx.context, 'task-a', 'metered');
  const holds = await readSpendProviderHolds(ctx.writer.db, 'main');

  expect([isHeld, holds.map((hold) => hold.taskID)]).toStrictEqual([true, ['task-a']]);
});

test('it holds no task on a route that the stopped provider does not hold', async () => {
  const ctx = await setupTest();

  await ctx.stopProvider('main', ['plan']);

  const isHeld = await holdTaskOnRoute(ctx.context, 'task-a', 'other');

  expect(isHeld).toBeFalse();
});

test('it holds a task again on the provider once the route stop that held it clears', async () => {
  const ctx = await setupTest();

  await ctx.stopRoute('plan');
  await ctx.stopProvider('main', ['plan']);

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  await ctx.clearRoute('plan');

  const isHeld = await holdTaskOnRoute(ctx.context, 'task-a', 'plan');
  const holds = await readSpendProviderHolds(ctx.writer.db, 'main');

  expect([isHeld, holds.map((hold) => hold.taskID)]).toStrictEqual([true, ['task-a']]);
});

test('it writes no second hold for a task that a standing route stop holds beside a provider stop', async () => {
  const ctx = await setupTest();

  await ctx.stopRoute('plan');
  await ctx.stopProvider('main', ['plan']);

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');
  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  const result =
    await sql`select kind, count(*) as held from records where kind like 'spend.%_held' group by kind`.execute(
      ctx.writer.db,
    );

  expect(result.rows).toStrictEqual([{ kind: 'spend.route_held', held: 1 }]);
});
