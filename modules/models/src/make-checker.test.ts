import { expect, mock, test } from 'bun:test';
import { makeChecker } from './make-checker';

test('it answers with the verdict the query returned and the profile model', async () => {
  const ask = mock(() => Promise.resolve({ verdict: 'asserted', reason: 'The owner states it.' }));
  const check = makeChecker({ ask, model: 'claude-test-1' });

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
  const signals: AbortSignal[] = [];
  const check = makeChecker({
    ask: (_request, signal) => {
      signals.push(signal);
      return Promise.withResolvers<never>().promise;
    },
    model: 'claude-test-1',
    timeoutMs: 20,
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer).toStrictEqual({
    verdict: 'unsure',
    reason: 'the checker did not answer in time',
    model: 'claude-test-1',
    failure: 'timeout',
  });
  expect(signals.map((signal) => signal.aborted)).toStrictEqual([true]);
});

test('it answers the verdict when the query answers inside the timeout', async () => {
  const check = makeChecker({
    ask: () => Promise.resolve({ verdict: 'not_asserted', reason: 'It is a question.' }),
    model: 'claude-test-1',
    timeoutMs: 20,
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer.verdict).toBe('not_asserted');
});

test('it answers unsure when the query fails', async () => {
  const check = makeChecker({
    ask: () => Promise.reject(new Error('the guest exited')),
    model: 'claude-test-1',
  });

  const answer = await check({ prompt: 'You check one memory.', input: 'the input' });

  expect(answer).toStrictEqual({
    verdict: 'unsure',
    reason: 'the checker failed',
    model: 'claude-test-1',
    failure: 'error',
  });
});
