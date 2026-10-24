import { expect, test } from 'bun:test';
import { findReplyStop } from './find-reply-stop.ts';

test('it finds where the first long enough silence after the start begins', () => {
  expect(
    findReplyStop({
      minSilenceSamples: 3,
      samples: new Float32Array([0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 0.5]),
      start: 1,
      threshold: 0.1,
    }),
  ).toBe(6);
});

test('it finds no stop when the reply never goes quiet for long enough', () => {
  expect(
    findReplyStop({
      minSilenceSamples: 3,
      samples: new Float32Array([0.5, 0, 0, 0.5, 0, 0.5]),
      start: 0,
      threshold: 0.1,
    }),
  ).toBeUndefined();
});

test('it counts a silence that is already under way at the start from the start', () => {
  expect(
    findReplyStop({
      minSilenceSamples: 2,
      samples: new Float32Array([0.5, 0, 0, 0, 0.5]),
      start: 2,
      threshold: 0.1,
    }),
  ).toBe(2);
});
