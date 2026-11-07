import { expect, test } from 'bun:test';
import { renderLinkedText } from './render-linked-text';

test("it writes a link on the page's site as its ID alone", () => {
  expect(
    renderLinkedText(
      ['Fares ', { link: 0 }],
      {
        pageURL: 'https://ferries.test/timetable',
        targets: ['https://ferries.test/fares'],
        numbers: new Map([['https://ferries.test/fares', 12]]),
      },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Fares [L12]', isCut: false });
});

test('it writes a link to another host with the host and path after its ID', () => {
  expect(
    renderLinkedText(
      ['Weather ', { link: 0 }],
      {
        pageURL: 'https://ferries.test/timetable',
        targets: ['https://weather.test/coast'],
        numbers: new Map([['https://weather.test/coast', 40]]),
      },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Weather [L40 · weather.test/coast]', isCut: false });
});

test.each([
  [6, 'https://weather.test/docs/marine/forecast', '[L40 · weather.test/docs/…]'],
  [13, 'https://weather.test/docs/marine/forecast', '[L40 · weather.test/docs/marine/…]'],
  [21, 'https://weather.test/docs/marine/forecast', '[L40 · weather.test/docs/marine/forecast]'],
  [6, 'https://weather.test/docs?area=north&days=7#top', '[L40 · weather.test/docs]'],
  [24, 'https://weather.test/docs/marine?area=north', '[L40 · weather.test/docs/marine]'],
])(
  'it cuts the path of an off-site link at %p characters and drops its query string, for %p',
  (linkPathChars, target, tag) => {
    expect(
      renderLinkedText(
        [{ link: 0 }],
        {
          pageURL: 'https://ferries.test/',
          targets: [target],
          numbers: new Map([[target, 40]]),
        },
        { textBytes: 1000, linkPathChars },
      ),
    ).toStrictEqual({ text: tag, isCut: false });
  },
);

test('it writes a square bracket in a path as its escape, so the tag ends only at its own bracket', () => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://weather.test/a]b[c'],
        numbers: new Map([['https://weather.test/a]b[c', 7]]),
      },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: '[L7 · weather.test/a%5Db%5Bc]', isCut: false });
});

test('it cuts a path before an escape that would pass the length, never inside it', () => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://cafe.test/caf%C3%A9/menu'],
        numbers: new Map([['https://cafe.test/caf%C3%A9/menu', 5]]),
      },
      { textBytes: 1000, linkPathChars: 6 },
    ),
  ).toStrictEqual({ text: '[L5 · cafe.test/caf…]', isCut: false });
});

test('it counts a subdomain of the page host as another host, and shows no path for its root', () => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://shop.ferries.test/'],
        numbers: new Map([['https://shop.ferries.test/', 3]]),
      },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: '[L3 · shop.ferries.test]', isCut: false });
});

test('it drops a mark with no target', () => {
  expect(
    renderLinkedText(
      ['Fares', { link: 4 }],
      { pageURL: 'https://ferries.test/', targets: [], numbers: new Map() },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Fares', isCut: false });
});

test('it cuts the text at the limit, never inside a character', () => {
  expect(
    renderLinkedText(
      ['Café au lait'],
      { pageURL: 'https://cafe.test/', targets: [], numbers: new Map() },
      { textBytes: 4, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Caf', isCut: true });
});

test('it drops a whole ID that would pass the limit', () => {
  expect(
    renderLinkedText(
      ['Fares ', { link: 0 }, ' and more'],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://weather.test/coast'],
        numbers: new Map([['https://weather.test/coast', 40]]),
      },
      { textBytes: 12, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Fares ', isCut: true });
});

test('it keeps 2,000 links to one off-site host with a long name inside the text limit', () => {
  const host = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.test`;
  const parts = Array.from({ length: 2000 }, () => [' ', { link: 0 }] as const).flat();

  const linked = renderLinkedText(
    parts,
    {
      pageURL: 'https://almanac.test/',
      targets: [`https://${host}/`],
      numbers: new Map([[`https://${host}/`, 1]]),
    },
    { textBytes: 20_000, linkPathChars: 24 },
  );

  expect(Buffer.byteLength(linked.text)).toBeLessThanOrEqual(20_000);
  expect(linked.isCut).toBeTrue();
});

test('it keeps 2,000 off-site links with long paths inside the text limit once each tag shows its path', () => {
  const targets = Array.from(
    { length: 2000 },
    (_, index) => `https://tides.test/harbours/station-${index}/${'observations/'.repeat(20)}`,
  );

  const parts = targets.flatMap((_, index) => [' ', { link: index }] as const);

  const linked = renderLinkedText(
    parts,
    {
      pageURL: 'https://almanac.test/',
      targets,
      numbers: new Map(targets.map((target, index) => [target, index + 1])),
    },
    { textBytes: 20_000, linkPathChars: 200 },
  );

  expect(Buffer.byteLength(linked.text)).toBeLessThanOrEqual(20_000);
  expect(linked.isCut).toBeTrue();
});
