import { expect, test } from 'bun:test';
import { findSoundSpan } from './find-sound-span.ts';

test('it finds the first and last sample at or above the threshold', () => {
  expect(findSoundSpan(new Float32Array([0, 0.001, -0.25, 0, 0.125, 0.001, 0]), 0.01)).toStrictEqual({
    end: 4,
    start: 2,
  });
});

test('it finds no span in audio that stays under the threshold', () => {
  expect(findSoundSpan(new Float32Array([0, 0.001, -0.001, 0]), 0.01)).toBeUndefined();
});
