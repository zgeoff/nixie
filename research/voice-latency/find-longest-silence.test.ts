import { expect, test } from 'bun:test';
import { findLongestSilence } from './find-longest-silence.ts';

test('it measures the longest quiet stretch inside the span', () => {
  expect(
    findLongestSilence({
      end: 8,
      sampleRate: 10,
      samples: new Float32Array([0.5, 0, 0.5, 0, 0, 0, 0.5, 0, 0.5, 0, 0, 0, 0, 0]),
      start: 0,
      threshold: 0.01,
    }),
  ).toBe(300);
});

test('it leaves out the quiet samples outside the span', () => {
  expect(
    findLongestSilence({
      end: 3,
      sampleRate: 10,
      samples: new Float32Array([0, 0, 0, 0, 0.5, 0, 0.5, 0.5]),
      start: 3,
      threshold: 0.01,
    }),
  ).toBe(100);
});

test('it finds no silence in a span that is all sound', () => {
  expect(
    findLongestSilence({ end: 2, sampleRate: 10, samples: new Float32Array([0.5, -0.5, 0.25]), start: 0, threshold: 0.01 }),
  ).toBe(0);
});
