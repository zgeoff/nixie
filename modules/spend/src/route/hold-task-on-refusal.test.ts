import { expect, test } from 'bun:test';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import { holdTaskOnRefusal } from './hold-task-on-refusal';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return {
    ...spend,
    buildStep: (taskID: string, route: string, startedAtMs: number) => ({
      taskID,
      route,
      sandboxName: 'sandbox-a',
      startedAtMs,
    }),
  };
}

test('it stops the route that the gateway counts at its limit and holds the task on it', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, ctx.buildStep('task-a', 'plan', 0));
  const stops = await readSpendRouteStops(ctx.writer.db);
  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');

  expect([isHeld, stops.map((stop) => stop.route), holds.map((hold) => hold.taskID)]).toStrictEqual(
    [true, ['plan'], ['task-a']],
  );
});

test('it holds nothing when the gateway counts the route under its limit and recorded no refusal', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, ctx.buildStep('task-a', 'plan', 0));

  expect(isHeld).toBe(false);
});

test('it answers that the gateway refused the step when the limit has reset since the refusal', async () => {
  const ctx = await setupTest();

  const startedAtMs = ctx.clock.now();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: {
      dollars: 0,
      tokens: 0,
      tripped: false,
      lastRefusal: { counter: 'route_day', route: 'plan', atMs: startedAtMs + 1000 },
    },
  });

  const isRefused = await holdTaskOnRefusal(
    ctx.context,
    ctx.buildStep('task-a', 'plan', startedAtMs),
  );

  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');

  expect([isRefused, holds]).toStrictEqual([true, []]);
});

test('it ignores a refusal that the gateway recorded before the step began', async () => {
  const ctx = await setupTest();

  const startedAtMs = ctx.clock.now();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: {
      dollars: 0,
      tokens: 0,
      tripped: false,
      lastRefusal: { counter: 'route_day', route: 'plan', atMs: startedAtMs - 1000 },
    },
  });

  const isRefused = await holdTaskOnRefusal(
    ctx.context,
    ctx.buildStep('task-a', 'plan', startedAtMs),
  );

  expect(isRefused).toBe(false);
});

test('it holds a task on its own route and leaves another route free', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, ctx.buildStep('task-b', 'metered', 0));

  expect(isHeld).toBe(false);
});
