import { expect, mock, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { makeChecker } from './make-checker';

test('it answers with the verdict the query returned and the profile model', async () => {
  const ask = mock(() => Promise.resolve({ verdict: 'asserted', reason: 'The owner states it.' }));

  const check = makeChecker({
    ask,
    model: 'claude-test-1',
    clock: buildTestClock(1_700_000_000_000),
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer).toStrictEqual({
    verdict: 'asserted',
    reason: 'The owner states it.',
    model: 'claude-test-1',
    failure: null,
  });

  expect(ask).toHaveBeenCalledExactlyOnceWith(
    { prompt: 'You check one memory.', input: 'the input' },
    expect.any(AbortSignal),
  );
});

test('it answers unsure and aborts the query when the query outlasts the timeout', async () => {
  const clock = buildTestClock(1_700_000_000_000);
  const signals: AbortSignal[] = [];

  const check = makeChecker({
    ask: (_request, signal) => {
      signals.push(signal);

      return Promise.withResolvers<never>().promise;
    },
    model: 'claude-test-1',
    clock,
    timeoutMs: 20_000,
  });

  const answering = check({ prompt: 'You check one memory.', input: 'the input' });

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(20_000);

  const answer = await answering;

  expect(answer).toStrictEqual({
    verdict: 'unsure',
    reason: 'the checker did not answer in time',
    model: 'claude-test-1',
    failure: 'timeout',
  });

  expect(signals.map((signal) => signal.aborted)).toStrictEqual([true]);
});

test('it answers the verdict and ends the timeout when the query answers inside it', async () => {
  const clock = buildTestClock(1_700_000_000_000);

  const check = makeChecker({
    ask: () => Promise.resolve({ verdict: 'not_asserted', reason: 'It is a question.' }),
    model: 'claude-test-1',
    clock,
    timeoutMs: 20_000,
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer.verdict).toBe('not_asserted');
  expect(clock.countSleepers()).toBe(0);
});

test('it answers unsure when the query fails', async () => {
  const check = makeChecker({
    ask: () => Promise.reject(new Error('the guest exited')),
    model: 'claude-test-1',
    clock: buildTestClock(1_700_000_000_000),
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer).toStrictEqual({
    verdict: 'unsure',
    reason: 'the checker failed',
    model: 'claude-test-1',
    failure: 'error',
  });
});
