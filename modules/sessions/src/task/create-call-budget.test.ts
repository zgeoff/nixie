import { expect, test } from 'bun:test';
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

test('it aborts its signal when the spend of a worker reaches the dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
    () => Promise.resolve(0),
  );

  budget.onSpend(0.01);

  const isReachedAfterFirst = budget.signal.aborted;

  budget.onSpend(0.01);

  expect({ isReachedAfterFirst, isReached: budget.signal.aborted }).toStrictEqual({
    isReachedAfterFirst: false,
    isReached: true,
  });
});

test('it lowers the dollars left by the calls, the late spend and the spend of a worker, and counts only the calls as spent', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    1,
    () => Promise.resolve(0.1),
  );

  await budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  budget.onSpend(0.25);

  expect({ left: budget.getLeftDollars(), spent: budget.getSpentDollars() }).toStrictEqual({
    left: 0.64,
    spent: 0.01,
  });
});

test('it never reports fewer than no dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.5,
    () => Promise.resolve(0),
  );

  budget.onSpend(2);

  expect(budget.getLeftDollars()).toBe(0);
});
