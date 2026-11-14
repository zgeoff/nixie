import { expect, test } from 'bun:test';
import { collectPageMatches } from './collect-page-matches';

test('it finds a match in a later part, in any case, with the text around it', () => {
  expect(
    collectPageMatches(
      ['The harbour opens at six. ', 'Ferries to the ISLAND leave hourly.'],
      'island',
    ),
  ).toStrictEqual([
    { part: 2, snippet: 'The harbour opens at six. Ferries to the ISLAND leave hourly.' },
  ]);
});

test('it gives a match that crosses into the next part the part it starts in', () => {
  expect(
    collectPageMatches(['Tides at noon and the light', 'house at dusk'], 'lighthouse'),
  ).toStrictEqual([{ part: 1, snippet: 'Tides at noon and the lighthouse at dusk' }]);
});

test('it keeps each match in its part after characters whose lowercase is longer', () => {
  expect(collectPageMatches([`${'İ'.repeat(30)} quay`, ' and pier'], 'QUAY')).toStrictEqual([
    { part: 1, snippet: `${'İ'.repeat(30)} quay and pier` },
  ]);
});

test('it matches a character whose case folds to more than one code unit as itself', () => {
  expect(collectPageMatches(['Kayak', 'İzmir ferries'], 'İzmir')).toStrictEqual([
    { part: 2, snippet: 'Kayakİzmir ferries' },
  ]);
});

test('it returns the first 10 matches', () => {
  const parts = Array.from({ length: 12 }, (_, index) => `Pier ${index}. `);

  expect(collectPageMatches(parts, 'pier').map((found) => found.part)).toStrictEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
});

test('it cuts the text around a match to 50 characters each side, never inside a character', () => {
  const text = `${'x'.repeat(10)}🌊${'a'.repeat(49)}quay${'b'.repeat(49)}🌊${'c'.repeat(10)}`;

  expect(collectPageMatches([text], 'quay')).toStrictEqual([
    { part: 1, snippet: `…🌊${'a'.repeat(49)}quay${'b'.repeat(49)}🌊…` },
  ]);
});

test('it reads the text to find as plain text, not as a pattern', () => {
  expect(collectPageMatches(['Fares (adult) 4.50', 'Fares (child) 2.00'], '(child)')).toStrictEqual(
    [{ part: 2, snippet: 'Fares (adult) 4.50Fares (child) 2.00' }],
  );
});

test('it returns no match for text the page does not hold', () => {
  expect(collectPageMatches(['The harbour opens at six.'], 'Grok')).toStrictEqual([]);
});
