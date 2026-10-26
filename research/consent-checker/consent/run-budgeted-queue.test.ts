import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBudgetedQueue } from './run-budgeted-queue.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-queue-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { outPath: join(dir, 'out.jsonl') };
}

test('it appends each output as one line and adds its cost to the spend', async () => {
  const ctx = await setupTest();

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    outPath: ctx.outPath,
    spentUSD: 0.5,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem: async (item) => ({ item, costUSD: 0.25, failure: null }),
  });

  expect(result).toStrictEqual({ ran: 2, costUSD: 1, isStoppedAtBudget: false, isStoppedByFailure: false });
  expect(await readFile(ctx.outPath, 'utf8')).toBe(
    '{"item":"a","costUSD":0.25,"failure":null}\n{"item":"b","costUSD":0.25,"failure":null}\n',
  );
});

test('it starts no item once the spend reaches the budget', async () => {
  const ctx = await setupTest();

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    outPath: ctx.outPath,
    spentUSD: 0,
    budgetUSD: 0.5,
    limit: null,
    concurrency: 1,
    runItem: async (item) => ({ item, costUSD: 0.6, failure: null }),
  });

  expect(result).toStrictEqual({ ran: 1, costUSD: 0.6, isStoppedAtBudget: true, isStoppedByFailure: false });
});

test('it starts no item when the spend before the run already reaches the budget', async () => {
  const ctx = await setupTest();
  const runItem = mock(async (item: string) => ({ item, costUSD: 0.1, failure: null }));

  const result = await runBudgetedQueue({
    items: ['a'],
    outPath: ctx.outPath,
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
  const ctx = await setupTest();

  const result = await runBudgetedQueue({
    items: ['a', 'b', 'c'],
    outPath: ctx.outPath,
    spentUSD: 0,
    budgetUSD: 4,
    limit: 2,
    concurrency: 2,
    runItem: async (item) => ({ item, costUSD: 0.1, failure: null }),
  });

  expect(result.ran).toBe(2);
});

test('it keeps the cost of an output with no answer and stops the run', async () => {
  const ctx = await setupTest();
  const runItem = mock(async (item: string) => ({ item, costUSD: 0.75, failure: 'no_output' }));

  const result = await runBudgetedQueue({
    items: ['a', 'b'],
    outPath: ctx.outPath,
    spentUSD: 0,
    budgetUSD: 4,
    limit: null,
    concurrency: 1,
    runItem,
  });

  expect(result).toStrictEqual({ ran: 0, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: true });
  expect(runItem).toHaveBeenCalledTimes(1);
  expect(await readFile(ctx.outPath, 'utf8')).toBe('{"item":"a","costUSD":0.75,"failure":"no_output"}\n');
});
