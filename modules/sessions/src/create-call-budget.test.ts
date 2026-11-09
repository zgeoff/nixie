import { expect, test } from 'bun:test';
import { createCallBudget } from './create-call-budget';

test('it aborts its signal on the call that reaches the dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
  );

  budget.onCall({
    uncachedInputTokens: 10_000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
  });

  budget.onCall({
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

test('it keeps its signal open while the calls cost less than the dollars left', () => {
  const budget = createCallBudget(
    { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    0.02,
  );

  budget.onCall({
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

test('it never reaches the budget of a profile that sets no prices', () => {
  const budget = createCallBudget(null, 0.02);

  budget.onCall({
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
