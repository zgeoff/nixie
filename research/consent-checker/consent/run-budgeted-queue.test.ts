import { expect, mock, test } from 'bun:test';
import type { QueueOutput } from './run-budgeted-queue.ts';
import { runBudgetedQueue } from './run-budgeted-queue.ts';
import { buildStubHeldRun } from './test-utils/build-stub-held-run.ts';

test('it appends each output and adds its cost to the spend', async () => {
  const appendOutput = mock<(output: QueueOutput) => Promise<void>>(() => Promise.resolve());

  const result = await runBudgetedQueue({
    items: [
      { costUSD: 0.25, failure: null },
      { costUSD: 0.5, failure: null },
    ],
    appendOutput,
    spentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: (item) => Promise.resolve(item),
  });

  expect(result).toStrictEqual({
    ran: 2,
    costUSD: 1.25,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  });

  expect(appendOutput.mock.calls).toStrictEqual([
    [{ costUSD: 0.25, failure: null }],
    [{ costUSD: 0.5, failure: null }],
  ]);
});

test('it starts no item once the spend reaches the budget', async () => {
  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    appendOutput: () => Promise.resolve(),
    spentUSD: 0,
    budgetUSD: 0.5,
    limit: null,
    concurrency: 1,
    runItem: (item) => Promise.resolve({ item, costUSD: 0.6, failure: null }),
  });

  expect(result).toStrictEqual({
    ran: 1,
    costUSD: 0.6,
    isStoppedAtBudget: true,
    isStoppedByFailure: false,
  });
});

test('it starts no item when the spend before the run already reaches the budget', async () => {
  const runItem = mock((item: string) => Promise.resolve({ item, costUSD: 0.1, failure: null }));

  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: () => Promise.resolve(),
    spentUSD: 4,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result.isStoppedAtBudget).toBe(true);
  expect(runItem).not.toHaveBeenCalled();
});

test('it runs as many items at once as its concurrency and no more', async () => {
  const held = buildStubHeldRun((item: string) => ({ item, costUSD: 0.1, failure: null }));

  const running = runBudgetedQueue({
    items: ['a', 'b', 'c'],
    appendOutput: () => Promise.resolve(),
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 2,
    runItem: held.run,
  });

  const startedBeforeRelease = [...held.started];

  held.releaseAll();

  await running;

  expect(startedBeforeRelease).toStrictEqual(['a', 'b']);
  expect(held.started).toStrictEqual(['a', 'b', 'c']);
});

test('it starts no more items than the limit', async () => {
  const result = await runBudgetedQueue({
    items: ['a', 'b', 'c'],
    appendOutput: () => Promise.resolve(),
    spentUSD: 0,
    budgetUSD: 4,
    limit: 2,
    concurrency: 2,
    runItem: (item) => Promise.resolve({ item, costUSD: 0.1, failure: null }),
  });

  expect(result.ran).toBe(2);
});

test('it keeps the cost of an output with no answer and stops the run', async () => {
  const runItem = mock((item: QueueOutput) => Promise.resolve(item));
  const appendOutput = mock<(output: QueueOutput) => Promise<void>>(() => Promise.resolve());

  const result = await runBudgetedQueue({
    items: [
      { costUSD: 0.75, failure: 'no_output' },
      { costUSD: 0.1, failure: null },
    ],
    appendOutput,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result).toStrictEqual({
    ran: 0,
    costUSD: 0.75,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
  });

  expect(runItem).toHaveBeenCalledTimes(1);
  expect(appendOutput.mock.calls).toStrictEqual([[{ costUSD: 0.75, failure: 'no_output' }]]);
});

test('it gives the reason of the output that stopped the run', async () => {
  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: () => Promise.resolve(),
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: (item) =>
      Promise.resolve({ item, costUSD: 0, failure: 'no_output', failureReason: 'error_max_turns' }),
  });

  expect(result).toStrictEqual({
    ran: 0,
    costUSD: 0,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
    failureReason: 'error_max_turns',
  });
});
