import { expect, test } from 'bun:test';
import { pickFailureState } from './pick-failure-state';
import type { HeldState } from './types';

function setupTest() {
  const failing: HeldState = {
    status: 'failing',
    reason: 'no_answer',
    sinceMs: 1000,
    lastSuccessAtMs: 500,
    failures: 3,
    retryAtMs: 2000,
  };

  return { failing };
}

test('it keeps the time a failing credential began failing when a later refresh fails too', () => {
  const ctx = setupTest();

  expect(pickFailureState(ctx.failing, 'service_error', 90_000).sinceMs).toBe(1000);
});

test('it dates the status from the failure that makes a credential fail', () => {
  const ctx = setupTest();

  const state = pickFailureState(
    { ...ctx.failing, status: 'active', failures: 2, sinceMs: 100 },
    'no_answer',
    90_000,
  );

  expect([state.status, state.sinceMs]).toStrictEqual(['failing', 90_000]);
});
