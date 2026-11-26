import { expect, test } from 'bun:test';
import { createCallBudget } from './create-call-budget';

test('it aborts its signal on the call that reaches the dollars left', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
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

test('it aborts its signal when the spend of a worker reaches the dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
  );

  budget.onSpend(0.01);

  const isReachedAfterFirst = budget.signal.aborted;

  budget.onSpend(0.01);

  expect({ isReachedAfterFirst, isReached: budget.signal.aborted }).toStrictEqual({
    isReachedAfterFirst: false,
    isReached: true,
  });
});

test('it lowers the dollars left by the calls and the spend of a worker, and counts only the calls as spent', async () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    1,
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
    left: 0.74,
    spent: 0.01,
  });
});

test('it never reports fewer than no dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.5,
  );

  budget.onSpend(2);

  expect(budget.getLeftDollars()).toBe(0);
});
