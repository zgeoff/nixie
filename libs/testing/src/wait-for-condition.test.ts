import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { buildTestClock } from './build-test-clock';
import { waitForCondition } from './wait-for-condition';

test('it resolves once the condition holds', async () => {
  const state = { checks: 0 };

  await waitForCondition(() => {
    state.checks += 1;

    return state.checks === 3;
  });

  expect(state.checks).toBe(3);
});

test('it keeps waiting when the wall clock jumps past the deadline', async () => {
  onTestFinished(() => {
    setSystemTime();
  });

  const state = { checks: 0 };

  await waitForCondition(
    () => {
      state.checks += 1;

      setSystemTime(Date.now() + 60_000);

      return state.checks === 3;
    },
    { timeoutMs: 1000 },
  );

  expect(state.checks).toBe(3);
});

test('it rejects once the clock it is given passes the timeout', () => {
  const clock = buildTestClock(0);

  const wait = waitForCondition(
    () => {
      clock.advance(400);

      return false;
    },
    { timeoutMs: 1000, now: clock.now },
  );

  expect(wait).rejects.toThrowWithMessage(Error, 'condition not met within 1000 ms');
});

test('it rejects when the condition never holds within the timeout', () => {
  expect(waitForCondition(() => false, { timeoutMs: 20 })).rejects.toThrowWithMessage(
    Error,
    'condition not met within 20 ms',
  );
});
