import { expect, test } from 'bun:test';
import { normalizeSpans } from './normalize-spans';

test('it keeps spans that cover the text in order', () => {
  expect(
    normalizeSpans('hello PASTED', [
      { start: 0, end: 6, source: 'typed' },
      { start: 6, end: 12, source: 'pasted' },
    ]),
  ).toStrictEqual({
    spans: [
      { start: 0, end: 6, source: 'typed' },
      { start: 6, end: 12, source: 'pasted' },
    ],
    labelled: 'as_sent',
  });
});

test.each([
  [
    'out of order',
    [
      { start: 6, end: 12, source: 'pasted' as const },
      { start: 0, end: 6, source: 'typed' as const },
    ],
  ],
  [
    'overlapping',
    [
      { start: 0, end: 7, source: 'typed' as const },
      { start: 6, end: 12, source: 'pasted' as const },
    ],
  ],
  [
    'with a gap',
    [
      { start: 0, end: 5, source: 'typed' as const },
      { start: 6, end: 12, source: 'pasted' as const },
    ],
  ],
  ['short of the end', [{ start: 0, end: 11, source: 'typed' as const }]],
  ['past the end', [{ start: 0, end: 13, source: 'typed' as const }]],
  ['not from the start', [{ start: 1, end: 12, source: 'typed' as const }]],
  [
    'with an empty span',
    [
      { start: 0, end: 0, source: 'pasted' as const },
      { start: 0, end: 12, source: 'typed' as const },
    ],
  ],
  ['missing', []],
])('it labels the whole message unknown when its spans are %s', (_label, spans) => {
  expect(normalizeSpans('hello PASTED', spans)).toStrictEqual({
    spans: [{ start: 0, end: 12, source: 'unknown' }],
    labelled: 'unknown',
  });
});

test('it counts offsets in UTF-16 code units', () => {
  expect(normalizeSpans('hi 👋', [{ start: 0, end: 5, source: 'typed' }]).labelled).toBe('as_sent');
});
