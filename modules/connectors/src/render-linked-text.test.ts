import { expect, test } from 'bun:test';
import { renderLinkedText } from './render-linked-text';

test("it writes a link on the page's site as its ID alone", () => {
  expect(
    renderLinkedText(['Fares ', { link: 0 }], {
      pageURL: 'https://ferries.test/timetable',
      targets: ['https://ferries.test/fares'],
      numbers: new Map([['https://ferries.test/fares', 12]]),
    }),
  ).toBe('Fares [L12]');
});

test('it writes a link to another host with the host after its ID', () => {
  expect(
    renderLinkedText(['Weather ', { link: 0 }], {
      pageURL: 'https://ferries.test/timetable',
      targets: ['https://weather.test/coast'],
      numbers: new Map([['https://weather.test/coast', 40]]),
    }),
  ).toBe('Weather [L40 · weather.test]');
});

test('it counts a subdomain of the page host as another host', () => {
  expect(
    renderLinkedText([{ link: 0 }], {
      pageURL: 'https://ferries.test/',
      targets: ['https://shop.ferries.test/'],
      numbers: new Map([['https://shop.ferries.test/', 3]]),
    }),
  ).toBe('[L3 · shop.ferries.test]');
});

test('it drops a mark with no target', () => {
  expect(
    renderLinkedText(['Fares', { link: 4 }], {
      pageURL: 'https://ferries.test/',
      targets: [],
      numbers: new Map(),
    }),
  ).toBe('Fares');
});
