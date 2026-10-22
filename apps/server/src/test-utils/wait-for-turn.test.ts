import { expect, mock, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { waitForTurn } from './wait-for-turn';

test('it waits past the condition wait default of 5 s for a turn that takes 20 s', async () => {
  const clock = buildTestClock(0);

  const wait = waitForTurn(() => {
    const elapsedMs = clock.now();

    clock.advance(10_000);

    return elapsedMs >= 20_000;
  }, clock.now);

  await expect(wait).toResolve();
});

test('it fails a turn that outlasts 30 s', () => {
  const clock = buildTestClock(0);

  const wait = waitForTurn(() => {
    clock.advance(10_000);

    return false;
  }, clock.now);

  expect(wait).rejects.toThrowWithMessage(Error, 'condition not met within 30000 ms');
});

test('it checks a turn no more often than every 100 ms', async () => {
  const startedAt = performance.now();
  const check = mock(() => performance.now() - startedAt >= 500);

  await waitForTurn(check);

  expect(check.mock.calls.length).toBeLessThanOrEqual(6);
});
