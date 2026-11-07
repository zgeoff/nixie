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
  ).toStrictEqual({ text: 'Fares [L12]', tags: [{ start: 6, end: 11 }] });
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
  ).toStrictEqual({
    text: 'Weather [L40 · weather.test/coast]',
    tags: [{ start: 8, end: 34 }],
  });
});

test.each([
  [6, '[L40 · weather.test/docs/…]'],
  [13, '[L40 · weather.test/docs/marine/…]'],
  [21, '[L40 · weather.test/docs/marine/forecast]'],
])('it cuts the path of an off-site link at %p characters', (linkPathChars, tag) => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://weather.test/docs/marine/forecast'],
        numbers: new Map([['https://weather.test/docs/marine/forecast', 40]]),
      },
      { textBytes: 1000, linkPathChars },
    ),
  ).toStrictEqual({ text: tag, tags: [{ start: 0, end: tag.length }] });
});

test.each([
  [6, 'https://weather.test/docs?area=north&days=7#top', '[L40 · weather.test/docs]'],
  [24, 'https://weather.test/docs/marine?area=north', '[L40 · weather.test/docs/marine]'],
  [24, 'https://weather.test/docs#tides', '[L40 · weather.test/docs]'],
])(
  'it shows no query string or fragment for an off-site link, at %p characters for %p',
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
    ).toStrictEqual({ text: tag, tags: [{ start: 0, end: tag.length }] });
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
  ).toStrictEqual({ text: '[L7 · weather.test/a%5Db%5Bc]', tags: [{ start: 0, end: 29 }] });
});

test.each([
  [6, '[L5 · cafe.test/caf…]'],
  [9, '[L5 · cafe.test/caf…]'],
  [10, '[L5 · cafe.test/caf%C3%A9…]'],
])(
  'it cuts a path at %p characters before a character whose escapes would pass the length, never among them',
  (linkPathChars, tag) => {
    expect(
      renderLinkedText(
        [{ link: 0 }],
        {
          pageURL: 'https://ferries.test/',
          targets: ['https://cafe.test/caf%C3%A9/menu'],
          numbers: new Map([['https://cafe.test/caf%C3%A9/menu', 5]]),
        },
        { textBytes: 1000, linkPathChars },
      ),
    ).toStrictEqual({ text: tag, tags: [{ start: 0, end: tag.length }] });
  },
);

test('it shows an IPv6 host in its brackets, followed by the path', () => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://[2001:db8::1]/breads'],
        numbers: new Map([['https://[2001:db8::1]/breads', 1]]),
      },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: '[L1 · [2001:db8::1]/breads]', tags: [{ start: 0, end: 27 }] });
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
  ).toStrictEqual({ text: '[L3 · shop.ferries.test]', tags: [{ start: 0, end: 24 }] });
});

test('it drops a mark with no target', () => {
  expect(
    renderLinkedText(
      ['Fares', { link: 4 }],
      { pageURL: 'https://ferries.test/', targets: [], numbers: new Map() },
      { textBytes: 1000, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Fares', tags: [] });
});

test('it keeps the whole text past the part limit, for the cut into parts', () => {
  expect(
    renderLinkedText(
      ['Café au lait'],
      { pageURL: 'https://cafe.test/', targets: [], numbers: new Map() },
      { textBytes: 4, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Café au lait', tags: [] });
});

test('it writes a tag longer than one part as its ID alone', () => {
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
  ).toStrictEqual({ text: 'Fares [L40] and more', tags: [{ start: 6, end: 11 }] });
});

test('it leaves out an ID longer than one part', () => {
  expect(
    renderLinkedText(
      ['Fares ', { link: 0 }, ' and more'],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://weather.test/coast'],
        numbers: new Map([['https://weather.test/coast', 40]]),
      },
      { textBytes: 4, linkPathChars: 24 },
    ),
  ).toStrictEqual({ text: 'Fares  and more', tags: [] });
});
