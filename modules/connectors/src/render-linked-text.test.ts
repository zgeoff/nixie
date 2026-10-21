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
      1000,
    ),
  ).toStrictEqual({ text: 'Fares [L12]', isCut: false });
});

test('it writes a link to another host with the host after its ID', () => {
  expect(
    renderLinkedText(
      ['Weather ', { link: 0 }],
      {
        pageURL: 'https://ferries.test/timetable',
        targets: ['https://weather.test/coast'],
        numbers: new Map([['https://weather.test/coast', 40]]),
      },
      1000,
    ),
  ).toStrictEqual({ text: 'Weather [L40 · weather.test]', isCut: false });
});

test('it counts a subdomain of the page host as another host', () => {
  expect(
    renderLinkedText(
      [{ link: 0 }],
      {
        pageURL: 'https://ferries.test/',
        targets: ['https://shop.ferries.test/'],
        numbers: new Map([['https://shop.ferries.test/', 3]]),
      },
      1000,
    ),
  ).toStrictEqual({ text: '[L3 · shop.ferries.test]', isCut: false });
});

test('it drops a mark with no target', () => {
  expect(
    renderLinkedText(
      ['Fares', { link: 4 }],
      { pageURL: 'https://ferries.test/', targets: [], numbers: new Map() },
      1000,
    ),
  ).toStrictEqual({ text: 'Fares', isCut: false });
});

test('it cuts the text at the limit, never inside a character', () => {
  expect(
    renderLinkedText(
      ['Café au lait'],
      { pageURL: 'https://cafe.test/', targets: [], numbers: new Map() },
      4,
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
      12,
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
    20_000,
  );

  expect(Buffer.byteLength(linked.text)).toBeLessThanOrEqual(20_000);
  expect(linked.isCut).toBeTrue();
});
