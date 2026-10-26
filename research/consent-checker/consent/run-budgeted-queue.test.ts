// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { expect, mock, test } from 'bun:test';
// @boundaries-ignore a spike imports the repo's condition wait by path
import { waitForCondition } from '../../../libs/testing/src/wait-for-condition.ts';
import type { QueueOutput } from './run-budgeted-queue.ts';
import { runBudgetedQueue } from './run-budgeted-queue.ts';
import { buildStubHeldRun } from './test-utils/build-stub-held-run.ts';

test('it appends each output and adds its cost to the spend', async () => {
  const appendOutput = mock<(output: QueueOutput) => Promise<void>>(() => Promise.resolve());

  const outputs = {
    first: { costUSD: 0.25, failure: null },
    second: { costUSD: 0.5, failure: null },
  };

  const result = await runBudgetedQueue({
    items: ['first', 'second'] as const,
    appendOutput,
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: (item) => Promise.resolve(outputs[item]),
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
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 0,
    budgetUSD: 0.5,
    limit: null,
    concurrency: 1,
    runItem: () => Promise.resolve({ costUSD: 0.6, failure: null }),
  });

  expect(result).toStrictEqual({
    ran: 1,
    costUSD: 0.6,
    isStoppedAtBudget: true,
    isStoppedByFailure: false,
  });
});

test('it starts no item when the spend before the run already reaches the budget', async () => {
  const runItem = mock(() => Promise.resolve({ costUSD: 0.1, failure: null }));

  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: () => Promise.resolve(),
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 4,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result.isStoppedAtBudget).toBe(true);
  expect(runItem).not.toHaveBeenCalled();
});

test('it starts no item whose reservation would pass what the budget leaves', async () => {
  const runItem = mock(() => Promise.resolve({ costUSD: 0.1, failure: null }));
  const appendReservation = mock(() => Promise.resolve());

  const result = await runBudgetedQueue({
    items: ['a'],
    appendOutput: () => Promise.resolve(),
    appendReservation,
    reserveUSD: 1.75,
    spentUSD: 3.5,
    budgetUSD: 5,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result).toStrictEqual({
    ran: 0,
    costUSD: 3.5,
    isStoppedAtBudget: true,
    isStoppedByFailure: false,
  });

  expect(appendReservation).not.toHaveBeenCalled();
  expect(runItem).not.toHaveBeenCalled();
});

test('it runs as many items at once as its concurrency and no more', async () => {
  const held = buildStubHeldRun<string, QueueOutput>(() => ({ costUSD: 0.1, failure: null }));

  const running = runBudgetedQueue({
    items: ['a', 'b', 'c'],
    appendOutput: () => Promise.resolve(),
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 2,
    runItem: held.run,
  });

  await waitForCondition(() => held.started.length === 2);

  const startedBeforeRelease = [...held.started];

  held.releaseAll();

  await running;

  expect(startedBeforeRelease).toStrictEqual(['a', 'b']);
  expect(held.started).toStrictEqual(['a', 'b', 'c']);
});

test('it appends each reservation before it runs the item, and the output after', async () => {
  const events: string[] = [];

  await runBudgetedQueue({
    items: ['a'],
    appendReservation: () => {
      events.push('reserve');

      return Promise.resolve();
    },
    appendOutput: () => {
      events.push('append');

      return Promise.resolve();
    },
    reserveUSD: 0.1,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: () => {
      events.push('run');

      return Promise.resolve({ costUSD: 0.02, failure: null });
    },
  });

  expect(events).toStrictEqual(['reserve', 'run', 'append']);
});

test('it holds a call in the spend at its reservation until the call settles', async () => {
  const runItem = mock(() => Promise.resolve({ costUSD: 0.02, failure: null }));

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    appendReservation: () => Promise.resolve(),
    appendOutput: () => Promise.resolve(),
    reserveUSD: 0.5,
    spentUSD: 0,
    budgetUSD: 0.5,
    limit: null,
    concurrency: 2,
    runItem,
  });

  expect(result).toStrictEqual({
    ran: 1,
    costUSD: 0.02,
    isStoppedAtBudget: true,
    isStoppedByFailure: false,
  });

  expect(runItem).toHaveBeenCalledTimes(1);
});

test('it lets every running item finish and starts no more before it passes on a failed append', async () => {
  const failure = new Error('no space left on device');

  const outputs = {
    one: { item: 'one', costUSD: 0.1, failure: null },
    two: { item: 'two', costUSD: 0.1, failure: null },
    three: { item: 'three', costUSD: 0.1, failure: null },
  } as const;

  const held = buildStubHeldRun((item: 'one' | 'two' | 'three') => outputs[item]);
  const appended: string[] = [];

  const appendAnswers = {
    one: () => Promise.reject(failure),
    two: () => Promise.resolve(),
    three: () => Promise.resolve(),
  };

  const outcome = Promise.allSettled([
    runBudgetedQueue({
      items: ['one', 'two', 'three'],
      appendOutput: (output) => {
        appended.push(output.item);

        return appendAnswers[output.item]();
      },
      appendReservation: () => Promise.resolve(),
      reserveUSD: 0,
      spentUSD: 0,
      budgetUSD: 4,
      limit: null,
      concurrency: 2,
      runItem: held.run,
    }),
  ]);

  held.release('one');

  await waitForCondition(() => appended.includes('one'));

  held.releaseAll();

  const settled = await outcome;

  const appendedBeforeSettle = [...appended];

  expect(settled).toStrictEqual([{ status: 'rejected', reason: failure }]);
  expect(appendedBeforeSettle).toStrictEqual(['one', 'two']);
  expect(held.started).toStrictEqual(['one', 'two']);
});

test('it starts no more items than the limit', async () => {
  const result = await runBudgetedQueue({
    items: ['a', 'b', 'c'],
    appendOutput: () => Promise.resolve(),
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 0,
    budgetUSD: 4,
    limit: 2,
    concurrency: 2,
    runItem: () => Promise.resolve({ costUSD: 0.1, failure: null }),
  });

  expect(result.ran).toBe(2);
});

test('it keeps the cost of an output with no answer and stops the run', async () => {
  const outputs = {
    first: { costUSD: 0.75, failure: 'no_output' },
    second: { costUSD: 0.1, failure: null },
  };

  const runItem = mock((item: 'first' | 'second') => Promise.resolve(outputs[item]));
  const appendOutput = mock<(output: QueueOutput) => Promise<void>>(() => Promise.resolve());

  const result = await runBudgetedQueue({
    items: ['first', 'second'],
    appendOutput,
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
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
    appendReservation: () => Promise.resolve(),
    reserveUSD: 0,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: () =>
      Promise.resolve({ costUSD: 0, failure: 'no_output', failureReason: 'error_max_turns' }),
  });

  expect(result).toStrictEqual({
    ran: 0,
    costUSD: 0,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
    failureReason: 'error_max_turns',
  });
});
