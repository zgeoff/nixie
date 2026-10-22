import { expect, mock, onTestFinished, setSystemTime, test } from 'bun:test';
import { waitForTurn } from './wait-for-turn';

test('it waits past the condition wait default of 5 s for a turn that takes 20 s', async () => {
  const startedAt = Date.now();

  onTestFinished(() => {
    setSystemTime();
  });

  const wait = waitForTurn(() => {
    const now = Date.now();

    setSystemTime(now + 10_000);

    return now - startedAt >= 20_000;
  });

  await expect(wait).toResolve();
});

test('it fails a turn that outlasts 30 s', () => {
  onTestFinished(() => {
    setSystemTime();
  });

  const wait = waitForTurn(() => {
    setSystemTime(Date.now() + 10_000);

    return false;
  });

  expect(wait).rejects.toThrowWithMessage(Error, 'condition not met within 30000 ms');
});

test('it checks a turn no more often than every 100 ms', async () => {
  const startedAt = performance.now();
  const check = mock(() => performance.now() - startedAt >= 500);

  await waitForTurn(check);

  expect(check.mock.calls.length).toBeLessThanOrEqual(6);
});
