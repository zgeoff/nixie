import { expect, mock, test } from 'bun:test';
import { createGatewayBudget } from './create-gateway-budget';

function setupTest(leftDollars: number) {
  const setLeftDollars = mock<(left: number) => Promise<boolean>>(() => Promise.resolve(true));
  const readWorkerEnd = mock<() => Promise<void>>(() => Promise.resolve());
  const readCountMicros = mock<() => Promise<number | null>>(() => Promise.resolve(500_000));

  return {
    setLeftDollars,
    readWorkerEnd,
    readCountMicros,
    budget: createGatewayBudget({
      leftDollars,
      startMicros: 500_000,
      readCountMicros,
      setLeftDollars,
      readWorkerEnd,
    }),
  };
}

test('it takes the planned dollars of a worker run off what is left', async () => {
  const ctx = setupTest(2);

  const granted = await ctx.budget.onWorkerStart?.(0.5);

  expect(granted).toBe(0.5);
  expect(ctx.setLeftDollars.mock.calls).toStrictEqual([[1.5]]);
  expect(ctx.budget.getLeftDollars()).toBe(1.5);
});

test('it takes the planned dollars of a second worker run off after the first', async () => {
  const ctx = setupTest(2);

  await ctx.budget.onWorkerStart?.(0.5);
  await ctx.budget.onWorkerStart?.(0.75);

  expect(ctx.setLeftDollars.mock.calls).toStrictEqual([[1.5], [0.75]]);
});

test('it gives the planned dollars back and takes off what the worker run charged', async () => {
  const ctx = setupTest(2);

  await ctx.budget.onWorkerStart?.(0.5);
  await ctx.budget.onWorkerEnd?.({ plannedDollars: 0.5, chargedDollars: 0.125 });

  expect(ctx.readWorkerEnd.mock.calls).toHaveLength(1);
  expect(ctx.setLeftDollars.mock.calls).toStrictEqual([[1.5], [1.875]]);
  expect(ctx.budget.getLeftDollars()).toBe(1.875);
});

test('it leaves the dollars on the sandbox and refuses the worker run when the gateway does not take them', async () => {
  const ctx = setupTest(2);

  ctx.setLeftDollars.mockResolvedValueOnce(false);

  const granted = await ctx.budget.onWorkerStart?.(0.5);

  expect(granted).toBe(0);
  expect(ctx.budget.getLeftDollars()).toBe(2);
});

test('it gives a worker run only what the turn left of the sandbox since its step began', async () => {
  const ctx = setupTest(3);

  ctx.readCountMicros.mockResolvedValue(2_000_000);

  const granted = await ctx.budget.onWorkerStart?.(2);

  expect(granted).toBe(1.5);
  expect(ctx.setLeftDollars.mock.calls).toStrictEqual([[1.5]]);
});

test('it gives each of two worker runs that ask together what the other left', async () => {
  const ctx = setupTest(3);

  const grants = await Promise.all([ctx.budget.onWorkerStart?.(2), ctx.budget.onWorkerStart?.(2)]);

  expect(grants).toStrictEqual([2, 1]);
  expect(ctx.setLeftDollars.mock.calls).toStrictEqual([[1], [0]]);
});

test('it gives a worker run nothing when the task has no dollars left or the gateway does not answer', async () => {
  const ctx = setupTest(1);

  await ctx.budget.onWorkerStart?.(1);

  const none = await ctx.budget.onWorkerStart?.(1);

  ctx.readCountMicros.mockResolvedValueOnce(null);

  const unreached = await ctx.budget.onWorkerStart?.(1);

  expect([none, unreached]).toStrictEqual([0, 0]);
});

test('it never aborts its signal and prices no call', async () => {
  const ctx = setupTest(0.01);

  await ctx.budget.onCall({
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 1_000_000,
  });

  expect({
    isAborted: ctx.budget.signal.aborted,
    spent: ctx.budget.getSpentDollars(),
  }).toStrictEqual({ isAborted: false, spent: 0 });
});
