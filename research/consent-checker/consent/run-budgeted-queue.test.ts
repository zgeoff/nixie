import { expect, mock, test } from 'bun:test';
import { runBudgetedQueue } from './run-budgeted-queue.ts';

test('it appends each output and adds its cost to the spend', async () => {
  const appendOutput = mock(async (_output: { item: string; costUSD: number; failure: string | null }) => {});

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    appendOutput,
    spentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: async (item) => ({ item, costUSD: 0.25, failure: null }),
  });

  expect(result).toStrictEqual({ ran: 2, costUSD: 1, isStoppedAtBudget: false, isStoppedByFailure: false });
  expect(appendOutput.mock.calls).toStrictEqual([
    [{ item: 'a', costUSD: 0.25, failure: null }],
    [{ item: 'b', costUSD: 0.25, failure: null }],
  ]);
});

test('it starts no item once the spend reaches the budget', async () => {
  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    appendOutput: async () => {},
    spentUSD: 0,
    budgetUSD: 0.5,
    limit: null,
    concurrency: 1,
    runItem: async (item) => ({ item, costUSD: 0.6, failure: null }),
  });

  expect(result).toStrictEqual({ ran: 1, costUSD: 0.6, isStoppedAtBudget: true, isStoppedByFailure: false });
});

test('it starts no item when the spend before the run already reaches the budget', async () => {
  const runItem = mock(async (item: string) => ({ item, costUSD: 0.1, failure: null }));

  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: async () => {},
    spentUSD: 4,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result.isStoppedAtBudget).toBe(true);
  expect(runItem).not.toHaveBeenCalled();
});

test('it starts no more items than the limit', async () => {
  const result = await runBudgetedQueue({
    items: ['a', 'b', 'c'],
    appendOutput: async () => {},
    spentUSD: 0,
    budgetUSD: 4,
    limit: 2,
    concurrency: 2,
    runItem: async (item) => ({ item, costUSD: 0.1, failure: null }),
  });

  expect(result.ran).toBe(2);
});

test('it keeps the cost of an output with no answer and stops the run', async () => {
  const runItem = mock(async (item: string) => ({ item, costUSD: 0.75, failure: 'no_output' }));
  const appendOutput = mock(async (_output: { item: string; costUSD: number; failure: string | null }) => {});

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    appendOutput,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result).toStrictEqual({ ran: 0, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: true });
  expect(runItem).toHaveBeenCalledTimes(1);
  expect(appendOutput.mock.calls).toStrictEqual([[{ item: 'a', costUSD: 0.75, failure: 'no_output' }]]);
});

test('it gives the reason of the output that stopped the run', async () => {
  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: async () => {},
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: async (item) => ({ item, costUSD: 0, failure: 'no_output', failureReason: 'error_max_turns' }),
  });

  expect(result).toStrictEqual({
    ran: 0,
    costUSD: 0,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
    failureReason: 'error_max_turns',
  });
});
