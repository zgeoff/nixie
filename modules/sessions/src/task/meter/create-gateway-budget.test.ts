import { expect, mock, test } from 'bun:test';
import { createGatewayBudget } from './create-gateway-budget';

function setupTest(leftDollars: number) {
  const setLeftDollars = mock<(left: number) => Promise<boolean>>(() => Promise.resolve(true));
  const readWorkerEnd = mock<() => Promise<void>>(() => Promise.resolve());

  return {
    setLeftDollars,
    readWorkerEnd,
    budget: createGatewayBudget({ leftDollars, setLeftDollars, readWorkerEnd }),
  };
}

test('it takes the planned dollars of a worker run off what is left', async () => {
  const ctx = setupTest(2);

  const isTaken = await ctx.budget.onWorkerStart?.(0.5);

  expect(isTaken).toBe(true);
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

  const isTaken = await ctx.budget.onWorkerStart?.(0.5);

  expect(isTaken).toBe(false);
  expect(ctx.budget.getLeftDollars()).toBe(2);
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
