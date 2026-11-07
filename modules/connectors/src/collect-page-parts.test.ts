import { expect, test } from 'bun:test';
import { collectPageParts } from './collect-page-parts';
import { renderLinkedText } from './render-linked-text';

test('it keeps a text that fits the limit as one part', () => {
  expect(collectPageParts({ text: 'Ferries leave at nine.', tags: [] }, 100)).toStrictEqual([
    'Ferries leave at nine.',
  ]);
});

test('it keeps an empty text as one empty part', () => {
  expect(collectPageParts({ text: '', tags: [] }, 100)).toStrictEqual(['']);
});

test.each([
  ['the last line break', 'Tides at six\nand at noon', 20, ['Tides at six\n', 'and at noon']],
  [
    'the last space, when no line break fits',
    'Tides at six and noon',
    15,
    ['Tides at six ', 'and noon'],
  ],
  ['the last whole character, when no space fits', 'ééééé', 5, ['éé', 'éé', 'é']],
])('it ends a part at %s within the limit', (_, text, limitBytes, parts) => {
  expect(collectPageParts({ text, tags: [] }, limitBytes)).toStrictEqual(parts);
});

test('it never splits the two halves of a character outside the basic plane', () => {
  expect(collectPageParts({ text: '🌊🌊🌊', tags: [] }, 5)).toStrictEqual(['🌊', '🌊', '🌊']);
});

test('it ends a part before a link tag the limit falls inside', () => {
  expect(collectPageParts({ text: 'ab[L12]cd', tags: [{ start: 2, end: 7 }] }, 5)).toStrictEqual([
    'ab',
    '[L12]',
    'cd',
  ]);
});

test('it never ends a part at a space inside a link tag', () => {
  const text = 'a [L4 · b.test/c]xxxxxxxx';

  expect(collectPageParts({ text, tags: [{ start: 2, end: 17 }] }, 20)).toStrictEqual([
    'a ',
    '[L4 · b.test/c]xxxx',
    'xxxx',
  ]);
});

test('it leaves out a character wider than a whole part, so the cut ends', () => {
  expect(collectPageParts({ text: 'a🌊b', tags: [] }, 3)).toStrictEqual(['a', 'b']);
});

test('it cuts 2,000 links to one off-site host with a long name into parts that each fit the limit', () => {
  const host = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.test`;
  const marked = Array.from({ length: 2000 }, () => [' ', { link: 0 }] as const).flat();

  const linked = renderLinkedText(
    marked,
    {
      pageURL: 'https://almanac.test/',
      targets: [`https://${host}/`],
      numbers: new Map([[`https://${host}/`, 1]]),
    },
    { textBytes: 20_000, linkPathChars: 24 },
  );

  const parts = collectPageParts(linked, 20_000);

  expect(parts).toSatisfyAll((part: string) => Buffer.byteLength(part) <= 20_000);
  expect(parts.join('')).toBe(linked.text);
});
