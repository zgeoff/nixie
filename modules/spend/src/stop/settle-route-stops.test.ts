import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { holdTaskOnRoute } from '../route/hold-task-on-route';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import { readSpendFacts } from './read-spend-facts';
import { readSpendRouteHolds } from './read-spend-route-holds';
import { readSpendRouteStops } from './read-spend-route-stops';
import { settleRouteStops } from './settle-route-stops';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return {
    ...spend,
    buildStatusRaisedTo: (limit: number, dollars: number) => {
      const tripped = buildTrippedGatewayStatus();
      const plan = tripped.routes['plan'];

      invariant(plan !== undefined, 'the mock status holds the route plan');

      return {
        ...tripped,
        routes: { ...tripped.routes, plan: { ...plan, day: { ...plan.day, limit, dollars } } },
      };
    },
    settle: async () => {
      const facts = await readSpendFacts(spend.context);

      await settleRouteStops(spend.context, facts);
    },
    readRecords: async (kind: string) => {
      const result =
        await sql`select thread, payload from records where kind = ${kind} order by sequence`.execute(
          spend.writer.db,
        );

      return result.rows;
    },
  };
}

test('it sends the owner one notice that names the route, however many polls find it stopped', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();
  await ctx.settle();

  const notices = await ctx.readRecords('spend.route_stopped');

  expect(notices).toStrictEqual([
    {
      thread: null,
      payload: JSON.stringify({
        route: 'plan',
        period: 'day',
        limit: 40,
        spent: 41.2,
        at: Date.parse('2026-11-13T08:42:07Z'),
        resetsAt: Date.parse('2026-11-14T00:00:00Z'),
      }),
    },
  ]);
});

test('it stops no other route than the one that reached its limit', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops.map((stop) => stop.route)).toStrictEqual(['plan']);
});

test('it writes a wait notice on the thread of each task that waited when the route clears, with no dollar figure', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  const heldAt = ctx.clock.now();

  ctx.clock.advance(5 * 60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const notices = await ctx.readRecords('spend.wait_notice');
  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(notices).toStrictEqual([
    {
      thread: 'task-a',
      payload: JSON.stringify({
        taskID: 'task-a',
        sinceMs: heldAt,
        untilMs: ctx.clock.now(),
      }),
    },
  ]);

  expect(stops).toStrictEqual([]);
});

test('it changes no route stop while the gateway does not answer', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.settle();

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops).toHaveLength(1);
});

test('it keeps the holds, tells no one and restates the stop when a raise leaves the route over its day limit', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.clock.advance(60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: ctx.buildStatusRaisedTo(60, 61) });

  await ctx.settle();

  const stops = await readSpendRouteStops(ctx.writer.db);
  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');
  const stopped = await ctx.readRecords('spend.route_stopped');
  const cleared = await ctx.readRecords('spend.route_cleared');
  const waitNotices = await ctx.readRecords('spend.wait_notice');

  expect(stopped).toHaveLength(1);
  expect(cleared).toStrictEqual([]);
  expect(waitNotices).toStrictEqual([]);
  expect(stops.map((stop) => stop.limit)).toStrictEqual([60]);
  expect(holds.map((hold) => hold.taskID)).toStrictEqual(['task-a']);
});

test('it puts back no stop that a newer settle cleared, when a poll that read the gateway earlier in the same millisecond settles late', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const staleFacts = await readSpendFacts(ctx.context);

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  await settleRouteStops(ctx.context, staleFacts);

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops).toStrictEqual([]);
});

test('it clears the stop with facts read before a settle that failed', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const clearFacts = await readSpendFacts(ctx.context);
  const failingFacts = await readSpendFacts(ctx.context);

  const failing = settleRouteStops(
    {
      ...ctx.context,
      definitions: () => {
        throw new Error('the definitions are gone');
      },
    },
    failingFacts,
  );

  await Promise.allSettled([failing]);

  await settleRouteStops(ctx.context, clearFacts);

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops).toStrictEqual([]);
});
