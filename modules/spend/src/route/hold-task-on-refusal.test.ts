import { expect, test } from 'bun:test';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import { buildMockGatewayStatus, buildTrippedGatewayStatus, startTestSpend } from '../test-utils';
import { holdTaskOnRefusal } from './hold-task-on-refusal';

async function setupTest() {
  const spend = await startTestSpend();

  // the mock gateway counts the day of 13 Nov 2026
  spend.clock.advance(28 * 86_400_000);

  return spend;
}

test('it stops the route that the gateway counts at its limit and holds the task on it', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, 'task-a', 'plan');
  const stops = await readSpendRouteStops(ctx.writer.db);
  const holds = await readSpendRouteHolds(ctx.writer.db, 'plan');

  expect([isHeld, stops.map((stop) => stop.route), holds.map((hold) => hold.taskID)]).toStrictEqual(
    [true, ['plan'], ['task-a']],
  );
});

test('it holds nothing when the gateway counts the route under its limit', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, 'task-a', 'plan');

  expect(isHeld).toBe(false);
});

test('it holds a task on its own route and leaves another route free', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const isHeld = await holdTaskOnRefusal(ctx.context, 'task-b', 'metered');

  expect(isHeld).toBe(false);
});
