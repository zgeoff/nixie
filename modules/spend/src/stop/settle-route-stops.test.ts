import { expect, test } from 'bun:test';
import { readRecords, spendWaitNoticeCodec } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { holdTaskOnRoute } from '../route/hold-task-on-route';
import {
  buildMockGatewayStatus,
  buildProviderTrippedGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '../test-utils';
import { readSpendFacts } from './read-spend-facts';
import { readSpendProviderHolds } from './read-spend-provider-holds';
import { readSpendProviderStops } from './read-spend-provider-stops';
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

  const notices = await readRecords(ctx.log, { afterSequence: 0, kinds: ['spend.wait_notice'] });
  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(
    notices.map((notice) => ({
      thread: notice.record.thread,
      payload: spendWaitNoticeCodec.decode(notice.record.payload),
    })),
  ).toStrictEqual([
    {
      thread: 'task-a',
      payload: {
        shortID: expect.any(String),
        taskID: 'task-a',
        sinceMs: heldAt,
        untilMs: ctx.clock.now(),
      },
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

test('it clears the stop with newer facts after an older settle that found the stop as it stood', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await ctx.settle();

  const sameFacts = await readSpendFacts(ctx.context);

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const clearFacts = await readSpendFacts(ctx.context);

  await settleRouteStops(ctx.context, sameFacts);
  await settleRouteStops(ctx.context, clearFacts);

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops).toStrictEqual([]);
});

test('it sends the owner one notice that names the provider and its routes, however many polls find it stopped', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  await ctx.settle();
  await ctx.settle();

  const notices = await ctx.readRecords('spend.provider_stopped');
  const routeNotices = await ctx.readRecords('spend.route_stopped');

  expect([notices, routeNotices]).toStrictEqual([
    [
      {
        thread: null,
        payload: JSON.stringify({
          provider: 'main',
          routes: ['plan', 'metered'],
          period: 'day',
          limit: 100,
          spent: 101.5,
          at: Date.parse('2026-11-13T08:42:07Z'),
          resetsAt: Date.parse('2026-11-14T00:00:00Z'),
        }),
      },
    ],
    [],
  ]);
});

test('it stops the provider and leaves the routes with room unstopped', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  await ctx.settle();

  const providers = await readSpendProviderStops(ctx.writer.db);
  const routes = await readSpendRouteStops(ctx.writer.db);

  expect([providers.map((stop) => stop.provider), routes]).toStrictEqual([['main'], []]);
});

test('it writes a trip of a route and a trip of its provider in one settle, each once', async () => {
  const ctx = await setupTest();

  const providerTripped = buildProviderTrippedGatewayStatus();
  const routeTripped = buildTrippedGatewayStatus();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: { ...routeTripped, providers: providerTripped.providers },
  });

  await ctx.settle();
  await ctx.settle();

  const routes = await readSpendRouteStops(ctx.writer.db);
  const providers = await readSpendProviderStops(ctx.writer.db);

  expect([routes.map((stop) => stop.route), providers.map((stop) => stop.provider)]).toStrictEqual([
    ['plan'],
    ['main'],
  ]);
});

test('it writes a wait notice for each task that waited when the provider clears', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'metered');

  const heldAt = ctx.clock.now();

  ctx.clock.advance(5 * 60_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const notices = await readRecords(ctx.log, { afterSequence: 0, kinds: ['spend.wait_notice'] });
  const holds = await readSpendProviderHolds(ctx.writer.db, 'main');
  const cleared = await ctx.readRecords('spend.provider_cleared');

  expect(notices.map((notice) => spendWaitNoticeCodec.decode(notice.record.payload))).toStrictEqual(
    [{ shortID: expect.any(String), taskID: 'task-a', sinceMs: heldAt, untilMs: ctx.clock.now() }],
  );

  expect([holds, cleared]).toStrictEqual([
    [],
    [{ thread: null, payload: JSON.stringify({ provider: 'main', reason: 'raised' }) }],
  ]);
});

test('it clears a provider stop with the reason reset once its day has ended', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  await ctx.settle();

  ctx.clock.advance(24 * 3_600_000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const cleared = await ctx.readRecords('spend.provider_cleared');

  expect(cleared).toStrictEqual([
    { thread: null, payload: JSON.stringify({ provider: 'main', reason: 'reset' }) },
  ]);
});

test('it restates a provider stop at another limit and keeps its holds', async () => {
  const ctx = await setupTest();

  const tripped = buildProviderTrippedGatewayStatus();
  const main = tripped.providers['main'];

  invariant(main !== undefined, 'the mock status holds the provider main');

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: tripped });

  await ctx.settle();

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: {
      ...tripped,
      providers: { main: { ...main, day: { ...main.day, limit: 101, dollars: 101.5 } } },
    },
  });

  await ctx.settle();

  const restated = await ctx.readRecords('spend.provider_restated');
  const holds = await readSpendProviderHolds(ctx.writer.db, 'main');

  expect([restated.length, holds.map((hold) => hold.taskID)]).toStrictEqual([1, ['task-a']]);
});
