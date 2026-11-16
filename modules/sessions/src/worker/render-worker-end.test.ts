import { expect, test } from 'bun:test';
import { renderWorkerEnd } from './render-worker-end';

function setupTest() {
  return {
    shortID: 'w3k8',
    used: { turns: 2, tokens: 1500, dollars: 0.0123, minutes: 0.7 },
    limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
  };
}

test('it names the limit a worker stopped at, with what it used', () => {
  const sentence = renderWorkerEnd(
    { outcome: 'limit', limit: 'turns' },
    { ...setupTest(), isTaskLimit: false },
  );

  expect(sentence).toStartWith(
    'The worker w3k8 stopped at its turns limit of 25 and gave no answer.',
  );

  expect(sentence).toEndWith('Ask a narrower question, or do the work yourself.');
});

test('it says the task has the dollars left when the task limit capped the worker', () => {
  const sentence = renderWorkerEnd(
    { outcome: 'limit', limit: 'dollars' },
    { ...setupTest(), isTaskLimit: true },
  );

  expect(sentence).toContain('stopped because this task has $2.00 left of its dollar limit');
});

test.each([
  [{ outcome: 'sandbox_failed', detail: 'no room' } as const, 'could not start its sandbox'],
  [
    { outcome: 'model_failed', detail: 'rate limited.' } as const,
    'model call failed: rate limited.',
  ],
  [{ outcome: 'no_answer' } as const, 'ended with no answer'],
  [{ outcome: 'interrupted' } as const, 'stopped because this turn was interrupted'],
])('it renders the sentence of %o', (end, text) => {
  expect(renderWorkerEnd(end, { ...setupTest(), isTaskLimit: false })).toContain(text);
});
