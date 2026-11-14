import { expect, mock, test } from 'bun:test';
import { createCallBudget } from './create-call-budget';

test('it aborts its signal on the call that reaches the dollars left', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
    () => Promise.resolve(0),
  );

  await budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  await budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  expect({
    isReached: budget.signal.aborted,
    spentDollars: budget.getSpentDollars(),
  }).toStrictEqual({ isReached: true, spentDollars: 0.02 });
});

test('it keeps its signal open while the calls cost less than the dollars left', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
    () => Promise.resolve(0),
  );

  await budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 1000,
  });

  expect({
    isReached: budget.signal.aborted,
    spentDollars: budget.getSpentDollars(),
  }).toStrictEqual({ isReached: false, spentDollars: 0.015 });
});

test('it never reaches the budget of a profile that sets no prices, and reads no late spend', async () => {
  const readLateDollars = mock(() => Promise.resolve(0));
  const budget = createCallBudget(null, 0.02, readLateDollars);

  await budget.onCall({
    uncachedInputTokens: 10_000_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 10_000_000,
  });

  expect({
    isReached: budget.signal.aborted,
    spentDollars: budget.getSpentDollars(),
  }).toStrictEqual({ isReached: false, spentDollars: 0 });
});

test('it lowers the dollars left by a late spend, so a call reaches the budget sooner', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
    () => Promise.resolve(0.01),
  );

  await budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  expect({
    isReached: budget.signal.aborted,
    spentDollars: budget.getSpentDollars(),
  }).toStrictEqual({ isReached: true, spentDollars: 0.01 });
});

test('it rejects a call when the read of late spend fails, and keeps the call in its spend', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
    () => Promise.reject(new Error('the log is unreadable')),
  );

  const call = budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  expect(call).rejects.toThrow('the log is unreadable');

  await Promise.allSettled([call]);

  expect(budget.getSpentDollars()).toBe(0.01);
});
