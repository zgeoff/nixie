import { expect, test } from 'bun:test';
import { readPause, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendProviderStops } from '../stop/read-spend-provider-stops';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { settleSpendStop } from '../stop/settle-spend-stop';
import {
  buildMockGatewayStatus,
  buildProviderTrippedGatewayStatus,
  buildTrippedGatewayStatus,
  startTestSpend,
} from '../test-utils';
import type { RaiseRequest } from './pick-raise-refusal';
import { writeHostSpendRaise } from './write-host-spend-raise';
import { writeSpendRaise } from './write-spend-raise';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return {
    ...spend,
    trip: async () => {
      spend.gateway.readStatus.mockResolvedValue({
        kind: 'ok',
        value: buildTrippedGatewayStatus(),
      });

      const facts = await readSpendFacts(spend.context);

      await settleSpendStop(spend.context, facts);
    },
    raise: (overrides: Partial<RaiseRequest> = {}) =>
      writeSpendRaise(spend.context, {
        start: '2026-11-13',
        route: 'plan',
        dollars: 50,
        by: 'session-a',
        ...overrides,
      }),
    raiseProvider: (provider: string, dollars: number) =>
      writeSpendRaise(spend.context, {
        start: '2026-11-13',
        provider,
        dollars,
        by: 'session-a',
      }),
    hostRaise: (turns: number) => writeHostSpendRaise(spend.context, { turns }),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
    tripProvider: async () => {
      spend.gateway.readStatus.mockResolvedValue({
        kind: 'ok',
        value: buildProviderTrippedGatewayStatus(),
      });

      const facts = await readSpendFacts(spend.context);

      await settleSpendStop(spend.context, facts);
    },
    readProviderRaises: async () => {
      const result =
        await sql`select provider_id, start, dollars, raised_by from spend_provider_raises`.execute(
          spend.writer.db,
        );

      return result.rows;
    },
    readRouteRaises: async () => {
      const result =
        await sql`select route_id, start, dollars, raised_by from spend_route_raises`.execute(
          spend.writer.db,
        );

      return result.rows;
    },
    readTurnRaises: async () => {
      const result = await sql`select start, turns, raised_by from spend_raises`.execute(
        spend.writer.db,
      );

      return result.rows;
    },
  };
}

test('it lifts a route trip with one call: it records the raise, tells the gateway the route and clears the route stop', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const result = await ctx.raise();
  const stops = await readSpendRouteStops(ctx.writer.db);
  const raises = await ctx.readRouteRaises();

  expect(result).toStrictEqual({ state: 'clear' });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([
    [{ target: { kind: 'route', id: 'plan' }, start: '2026-11-13', dollars: 50 }],
  ]);

  expect(stops).toStrictEqual([]);

  expect(raises).toStrictEqual([
    { route_id: 'plan', start: '2026-11-13', dollars: 50, raised_by: 'session-a' },
  ]);
});

test('it keeps the day stop of a route whose month is at its limit too, when midnight passes during the raise', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const tripped = buildTrippedGatewayStatus();
  const plan = tripped.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const both = {
    ...tripped,
    routes: { plan: { provider: 'main', day: plan.day, month: { ...plan.month, tripped: true } } },
  };

  ctx.gateway.postRaise.mockImplementation(() => {
    ctx.clock.advance(16 * 3_600_000);

    return Promise.resolve({ kind: 'ok', value: both });
  });

  await ctx.raise();

  const stops = await readSpendRouteStops(ctx.writer.db);

  expect(stops.map((stop) => [stop.route, stop.period])).toStrictEqual([['plan', 'day']]);
});

test('it never pauses nixie for a raise of a route', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.raise();

  const paused = await ctx.readPaused();

  expect(paused).toBeNull();
});

test('it leaves the route stop standing when the raise does not lift the route', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const result = await ctx.raise();
  const stops = await readSpendRouteStops(ctx.writer.db);

  expect([result, stops.map((stop) => stop.route)]).toStrictEqual([{ state: 'stopped' }, ['plan']]);
});

test('it refuses a raise above the route cap, writes nothing and tells the gateway nothing', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ dollars: 80.01 });
  const raises = await ctx.readRouteRaises();

  expect(result).toStrictEqual({
    error: 'above_cap',
    measure: 'dollars',
    route: 'plan',
    provider: null,
    cap: 80,
  });

  expect([raises, ctx.gateway.postRaise.mock.calls]).toStrictEqual([[], []]);
});

test('it refuses a turn raise above the turn cap', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ turns: 2001 });

  expect(result).toStrictEqual({
    error: 'above_cap',
    measure: 'turns',
    route: null,
    provider: null,
    cap: 2000,
  });
});

test('it refuses a raise for a day that has ended', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ start: '2026-11-12' });
  const raises = await ctx.readRouteRaises();

  expect([result, raises]).toStrictEqual([{ error: 'period_ended' }, []]);
});

test('it refuses a raise for a route the gateway does not hold', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ route: 'ghost' });

  expect(result).toStrictEqual({ error: 'unknown_route' });
});

test('it writes nothing and returns the error when the gateway refuses the raise above its cap', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({
    kind: 'above_cap',
    route: 'plan',
    provider: null,
    cap: 45,
  });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();

  expect(result).toStrictEqual({
    error: 'above_cap',
    measure: 'dollars',
    route: 'plan',
    provider: null,
    cap: 45,
  });

  expect(raises).toStrictEqual([]);
});

test('it keeps the record when the gateway does not answer the raise, for the watcher to send again', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();
  const stops = await readSpendRouteStops(ctx.writer.db);

  expect([result, raises.length, stops.length]).toStrictEqual([{ error: 'unanswered' }, 1, 1]);
});

test('it answers unreachable and writes nothing when the gateway does not answer the status', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();

  expect([result, raises]).toStrictEqual([{ error: 'unreachable' }, []]);
});

test('it keeps the turns that an earlier raise set above what this raise holds', async () => {
  const ctx = await setupTest();

  await ctx.hostRaise(3000);

  await writeSpendRaise(ctx.context, { start: '2026-11-13', turns: 1500, by: 'session-a' });

  const raises = await ctx.readTurnRaises();

  expect(raises).toMatchObject([{ turns: 3000 }]);
});

test('it keeps the larger dollars when two raises of a route land at once', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await Promise.all([ctx.raise({ dollars: 60 }), ctx.raise({ dollars: 45 })]);

  const raises = await ctx.readRouteRaises();

  expect(raises).toMatchObject([{ route_id: 'plan', dollars: 60 }]);
});

test('it puts back no route stop that a raise of the route cleared while a raise of turns waited on its status', async () => {
  const ctx = await setupTest();

  const turnsStatus = Promise.withResolvers<Awaited<ReturnType<typeof ctx.gateway.readStatus>>>();

  await ctx.trip();

  ctx.gateway.readStatus.mockReturnValueOnce(turnsStatus.promise);

  const turnsRaise = writeSpendRaise(ctx.context, {
    start: '2026-11-13',
    turns: 1500,
    by: 'session-a',
  });

  await ctx.raise({ dollars: 60 });

  turnsStatus.resolve({ kind: 'ok', value: buildTrippedGatewayStatus() });

  await turnsRaise;

  const routeStops = await readSpendRouteStops(ctx.writer.db);

  expect(routeStops).toStrictEqual([]);
});

test('it holds the plan logins that the gateway reports', async () => {
  const ctx = await setupTest();

  ctx.gateway.readChatGPTLogins.mockResolvedValue({
    kind: 'ok',
    value: { 'codex-plan': { status: 'failing', accountID: 'acct-test-1', planType: 'plus' } },
  });

  await ctx.raise();

  expect(ctx.context.planLogins.read()).toStrictEqual({
    state: 'read',
    routes: { 'codex-plan': { status: 'failing', accountID: 'acct-test-1', planType: 'plus' } },
  });
});

test('it lifts a provider trip with one call: it records the raise, tells the gateway the provider and clears the provider stop', async () => {
  const ctx = await setupTest();

  await ctx.tripProvider();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const result = await ctx.raiseProvider('main', 150);
  const stops = await readSpendProviderStops(ctx.writer.db);
  const raises = await ctx.readProviderRaises();

  expect(result).toStrictEqual({ state: 'clear' });

  expect(ctx.gateway.postRaise.mock.calls).toStrictEqual([
    [{ target: { kind: 'provider', id: 'main' }, start: '2026-11-13', dollars: 150 }],
  ]);

  expect(stops).toStrictEqual([]);

  expect(raises).toStrictEqual([
    { provider_id: 'main', start: '2026-11-13', dollars: 150, raised_by: 'session-a' },
  ]);
});

test('it leaves the provider stop standing when the raise does not lift the provider', async () => {
  const ctx = await setupTest();

  await ctx.tripProvider();

  ctx.gateway.postRaise.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  const result = await ctx.raiseProvider('main', 110);
  const stops = await readSpendProviderStops(ctx.writer.db);

  expect([result, stops.map((stop) => stop.provider)]).toStrictEqual([
    { state: 'stopped' },
    ['main'],
  ]);
});

test('it refuses a raise above the provider cap, writes nothing and tells the gateway nothing', async () => {
  const ctx = await setupTest();

  await ctx.tripProvider();

  const result = await ctx.raiseProvider('main', 200.01);
  const raises = await ctx.readProviderRaises();

  expect(result).toStrictEqual({
    error: 'above_cap',
    measure: 'dollars',
    route: null,
    provider: 'main',
    cap: 200,
  });

  expect([raises, ctx.gateway.postRaise.mock.calls]).toStrictEqual([[], []]);
});

test('it refuses a raise for a provider the gateway does not hold', async () => {
  const ctx = await setupTest();
  const result = await ctx.raiseProvider('ghost', 5);

  expect(result).toStrictEqual({ error: 'unknown_provider' });
});

test('it refuses a raise of a route with no limit of its own, and writes nothing', async () => {
  const ctx = await setupTest();

  const status = buildMockGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: {
      ...status,
      routes: {
        ...status.routes,
        plan: { ...plan, day: { ...plan.day, limit: null, cap: null } },
      },
    },
  });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();

  expect([result, raises, ctx.gateway.postRaise.mock.calls]).toStrictEqual([
    { error: 'no_route_limit', route: 'plan' },
    [],
    [],
  ]);
});

test('it keeps a provider raise that the gateway did not answer, for the watcher to send again', async () => {
  const ctx = await setupTest();

  await ctx.tripProvider();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raiseProvider('main', 150);
  const raises = await ctx.readProviderRaises();

  expect([result, raises.length]).toStrictEqual([{ error: 'unanswered' }, 1]);
});
