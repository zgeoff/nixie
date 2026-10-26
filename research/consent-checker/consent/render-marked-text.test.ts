import { expect, test } from 'bun:test';
import { renderMarkedText } from './render-marked-text.ts';

test('it leaves typed text unmarked', () => {
  expect(
    renderMarkedText({
      sequence: 1,
      text: 'pin the ferry note',
      spans: [{ start: 0, end: 18, source: 'typed' }],
    }),
  ).toBe('pin the ferry note');
});

test.each(['pasted', 'dropped', 'unknown'] as const)('it marks a %s span as pasted', (source) => {
  expect(
    renderMarkedText({
      sequence: 1,
      text: 'open notes.txt',
      spans: [{ start: 5, end: 14, source }],
    }),
  ).toBe('open «pasted»notes.txt«/pasted»');
});

test('it marks each character of overlapping pasted spans once', () => {
  expect(
    renderMarkedText({
      sequence: 1,
      text: 'abcdefgh',
      spans: [
        { start: 4, end: 8, source: 'pasted' },
        { start: 2, end: 6, source: 'pasted' },
      ],
    }),
  ).toBe('ab«pasted»cdef«/pasted»«pasted»gh«/pasted»');
});
