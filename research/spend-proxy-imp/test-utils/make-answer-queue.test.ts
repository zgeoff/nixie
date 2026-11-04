import { expect, test } from 'bun:test';
import { makeAnswerQueue } from './make-answer-queue.ts';

test('it gives each answer once, in order', () => {
  const next = makeAnswerQueue(['low tide', 'high tide']);

  expect([next(), next()]).toStrictEqual(['low tide', 'high tide']);
});

test('it throws when a call comes after the last answer', () => {
  const next = makeAnswerQueue(['low tide']);
  next();

  expect(() => next()).toThrow('the answer queue held 1 answers, and all are used');
});
