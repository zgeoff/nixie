import { expect, test } from 'bun:test';
import { buildTextWithinLimit } from './build-text-within-limit';

test('it keeps a text inside the limit whole, with the target of each of its marks', () => {
  expect(
    buildTextWithinLimit(
      { text: 'The menu \u{E000}0\u{E001}.', links: ['https://cafe.test/menu'] },
      100,
    ),
  ).toStrictEqual({
    text: 'The menu \u{E000}0\u{E001}.',
    links: ['https://cafe.test/menu'],
    isCut: false,
  });
});

test('it cuts the text at the limit and keeps only the targets of the marks left in it', () => {
  expect(
    buildTextWithinLimit(
      {
        text: 'Menu \u{E000}0\u{E001} and opening hours \u{E000}1\u{E001}',
        links: ['https://cafe.test/menu', 'https://cafe.test/hours'],
      },
      30,
    ),
  ).toStrictEqual({
    text: 'Menu \u{E000}0\u{E001} and opening hours',
    links: ['https://cafe.test/menu'],
    isCut: true,
  });
});

test('it never cuts the text inside a character', () => {
  expect(buildTextWithinLimit({ text: 'café au lait', links: [] }, 4)).toStrictEqual({
    text: 'caf',
    links: [],
    isCut: true,
  });
});

test('it stops the text before the first mark whose target would pass the link target limit', () => {
  expect(
    buildTextWithinLimit(
      {
        text: 'A \u{E000}0\u{E001} B \u{E000}1\u{E001} A again \u{E000}0\u{E001}',
        links: ['https://cafe.test/a', `https://cafe.test/${'b'.repeat(150)}`],
      },
      40,
    ),
  ).toStrictEqual({
    text: 'A \u{E000}0\u{E001} B ',
    links: ['https://cafe.test/a'],
    isCut: true,
  });
});
