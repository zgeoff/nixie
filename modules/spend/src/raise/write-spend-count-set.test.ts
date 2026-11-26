import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { holdTaskOnRoute } from '../route/hold-task-on-route';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendProviderHolds } from '../stop/read-spend-provider-holds';
import { readSpendProviderStops } from '../stop/read-spend-provider-stops';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { settleSpendStop } from '../stop/settle-spend-stop';
import {
  buildMockGatewayStatus,
  buildProviderTrippedGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '../test-utils';
import { writeSpendCountSet } from './write-spend-count-set';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return {
    ...spend,
    trip: async (status: ReturnType<typeof buildMockGatewayStatus>) => {
      spend.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: status });

      const facts = await readSpendFacts(spend.context);

      await settleSpendStop(spend.context, facts);
    },
    resetProvider: () =>
      writeSpendCountSet(spend.context, {
        target: { kind: 'provider', id: 'main' },
        period: 'day',
        start: '2026-11-13',
        dollars: 0,
        by: 'session-a',
      }),
    resetRoute: () =>
      writeSpendCountSet(spend.context, {
        target: { kind: 'route', id: 'plan' },
        period: 'day',
        start: '2026-11-13',
        dollars: 0,
        by: 'session-a',
      }),
    readRecords: async (kind: string) => {
      const result = await sql`select thread, payload from records where kind = ${kind}`.execute(
        spend.writer.db,
      );

      return result.rows;
    },
  };
}

test('it resets a provider count: it tells the gateway, records the old and new dollars and clears the provider stop', async () => {
  const ctx = await setupTest();

  await ctx.trip(buildProviderTrippedGatewayStatus());

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  ctx.gateway.postCount.mockImplementation(() => {
    ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

    return Promise.resolve({ kind: 'ok' });
  });

  const result = await ctx.resetProvider();
  const stops = await readSpendProviderStops(ctx.writer.db);
  const records = await ctx.readRecords('spend.count_set');
  const cleared = await ctx.readRecords('spend.provider_cleared');

  expect(result).toStrictEqual({ state: 'clear' });

  expect(ctx.gateway.postCount.mock.calls).toStrictEqual([
    [{ target: { kind: 'provider', id: 'main' }, period: 'day', start: '2026-11-13', dollars: 0 }],
  ]);

  expect(stops).toStrictEqual([]);

  expect(records).toStrictEqual([
    {
      thread: null,
      payload: JSON.stringify({
        provider: 'main',
        period: 'day',
        start: '2026-11-13',
        from: 101.5,
        to: 0,
        by: 'session-a',
      }),
    },
  ]);

  expect(cleared).toStrictEqual([
    { thread: null, payload: JSON.stringify({ provider: 'main', reason: 'corrected' }) },
  ]);
});

test('it resets a route count and clears the route stop with the reason corrected', async () => {
  const ctx = await setupTest();

  await ctx.trip(buildTrippedGatewayStatus());

  ctx.gateway.postCount.mockImplementation(() => {
    ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

    return Promise.resolve({ kind: 'ok' });
  });

  const result = await ctx.resetRoute();
  const stops = await readSpendRouteStops(ctx.writer.db);
  const cleared = await ctx.readRecords('spend.route_cleared');

  expect([result, stops]).toStrictEqual([{ state: 'clear' }, []]);

  expect(cleared).toStrictEqual([
    { thread: null, payload: JSON.stringify({ route: 'plan', reason: 'corrected' }) },
  ]);
});

test('it writes a wait notice for a task that the cleared provider held', async () => {
  const ctx = await setupTest();

  await ctx.trip(buildProviderTrippedGatewayStatus());

  await holdTaskOnRoute(ctx.context, 'task-a', 'plan');

  ctx.gateway.postCount.mockImplementation(() => {
    ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

    return Promise.resolve({ kind: 'ok' });
  });

  await ctx.resetProvider();

  const holds = await readSpendProviderHolds(ctx.writer.db, 'main');
  const notices = await ctx.readRecords('spend.wait_notice');

  expect([holds, notices.length]).toStrictEqual([[], 1]);
});

test('it keeps the stop standing when the new count is still over the limit', async () => {
  const ctx = await setupTest();

  await ctx.trip(buildProviderTrippedGatewayStatus());

  ctx.gateway.postCount.mockResolvedValue({ kind: 'ok' });

  const result = await ctx.resetProvider();
  const stops = await readSpendProviderStops(ctx.writer.db);

  expect([result, stops.length]).toStrictEqual([{ state: 'stopped' }, 1]);
});

test.each([
  {
    name: 'the gateway does not answer the status',
    status: { kind: 'unreachable' as const, reason: 'no answer' },
    expected: { error: 'unreachable' },
  },
])('it answers $expected.error and writes nothing when $name', async (row) => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue(row.status);

  const result = await ctx.resetProvider();
  const records = await ctx.readRecords('spend.count_set');

  expect([result, records, ctx.gateway.postCount.mock.calls]).toStrictEqual([row.expected, [], []]);
});

test.each([
  {
    name: 'does not answer the change',
    posted: { kind: 'unreachable' as const, reason: 'x' },
    expected: { error: 'unreachable' },
  },
  {
    name: 'finds the day ended',
    posted: { kind: 'period_ended' as const },
    expected: { error: 'period_ended' },
  },
  {
    name: 'does not hold the provider',
    posted: { kind: 'not_found' as const },
    expected: { error: 'unknown_provider' },
  },
])('it writes no record when the gateway $name', async (row) => {
  const ctx = await setupTest();

  ctx.gateway.postCount.mockResolvedValue(row.posted);

  const result = await ctx.resetProvider();
  const records = await ctx.readRecords('spend.count_set');

  expect([result, records]).toStrictEqual([row.expected, []]);
});

test('it answers unknown_provider without telling the gateway for a provider the status lacks', async () => {
  const ctx = await setupTest();

  const result = await writeSpendCountSet(ctx.context, {
    target: { kind: 'provider', id: 'ghost' },
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
    by: 'session-a',
  });

  expect([result, ctx.gateway.postCount.mock.calls]).toStrictEqual([
    { error: 'unknown_provider' },
    [],
  ]);
});
