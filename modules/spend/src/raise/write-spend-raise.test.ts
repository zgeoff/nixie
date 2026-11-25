import { expect, test } from 'bun:test';
import { readPause, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { readSpendFacts } from '../stop/read-spend-facts';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { settleSpendStop } from '../stop/settle-spend-stop';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
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
    hostRaise: (turns: number) => writeHostSpendRaise(spend.context, { turns }),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
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
    [{ route: 'plan', start: '2026-11-13', dollars: 50 }],
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
    routes: { plan: { day: plan.day, month: { ...plan.month, tripped: true } } },
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

  expect(result).toStrictEqual({ error: 'above_cap', measure: 'dollars', route: 'plan', cap: 80 });
  expect([raises, ctx.gateway.postRaise.mock.calls]).toStrictEqual([[], []]);
});

test('it refuses a turn raise above the turn cap', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  const result = await ctx.raise({ turns: 2001 });

  expect(result).toStrictEqual({ error: 'above_cap', measure: 'turns', route: null, cap: 2000 });
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

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'above_cap', route: 'plan', cap: 45 });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();

  expect(result).toStrictEqual({ error: 'above_cap', measure: 'dollars', route: 'plan', cap: 45 });
  expect(raises).toStrictEqual([]);
});

test('it keeps the record when the gateway does not answer the raise, for the watcher to send again', async () => {
  const ctx = await setupTest();

  await ctx.trip();

  ctx.gateway.postRaise.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await ctx.raise();
  const raises = await ctx.readRouteRaises();
  const stops = await readSpendRouteStops(ctx.writer.db);

  expect([result, raises.length, stops.length]).toStrictEqual([{ error: 'unreachable' }, 1, 1]);
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
