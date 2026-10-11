import { expect, test } from 'bun:test';
import { waitForCondition } from './wait-for-condition';

test('it resolves once the condition holds', async () => {
  const state = { checks: 0 };

  await waitForCondition(() => {
    state.checks += 1;
    return state.checks === 3;
  });

  expect(state.checks).toBe(3);
});

test('it rejects when the condition never holds within the timeout', () => {
  expect(waitForCondition(() => false, { timeoutMs: 20 })).rejects.toThrowWithMessage(
    Error,
    'condition not met within 20 ms',
  );
});
