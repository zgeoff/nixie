import { expect, test } from 'bun:test';
import { captureAnswerSchema } from './capture-answer-schema';
import { capturePath } from './capture-path';

test('it accepts an answer of yes or no', () => {
  expect([
    captureAnswerSchema.safeParse({ canCapture: true }).data,
    captureAnswerSchema.safeParse({ canCapture: false }).data,
  ]).toStrictEqual([{ canCapture: true }, { canCapture: false }]);
});

test('it refuses an answer with another key', () => {
  expect(captureAnswerSchema.safeParse({ canCapture: true, spool: '/x' }).success).toBeFalse();
});

test('it keeps the path outside the grammar of a route ID', () => {
  expect(capturePath).toBe('/~capture');
});
