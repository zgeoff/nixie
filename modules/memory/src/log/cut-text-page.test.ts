import { expect, test } from 'bun:test';
import { cutTextPage } from './cut-text-page';

test('it returns the whole text with no next offset when it fits', () => {
  expect(cutTextPage('hello', 0, 100)).toStrictEqual({ text: 'hello', next: null });
});

test('it counts a quote and a newline at their escaped size', () => {
  expect(cutTextPage('a"b\nc', 0, 3)).toStrictEqual({ text: 'a"', next: 2 });
});

test('it keeps an emoji whole at the cut point', () => {
  const page = cutTextPage('ab😀cd', 0, 3);

  expect(page).toStrictEqual({ text: 'ab', next: 2 });
  expect(cutTextPage('ab😀cd', 2, 4)).toStrictEqual({ text: '😀', next: 4 });
});

test('it takes one code point when the budget is smaller than it', () => {
  expect(cutTextPage('😀😀', 0, 1)).toStrictEqual({ text: '😀', next: 2 });
});
