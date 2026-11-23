import { expect, test } from 'bun:test';
import { renderItemQuote } from './render-item-quote';

test('it renders no line for an item with no quote', () => {
  expect(renderItemQuote({ evidenceQuote: null }, () => 'f00000000001')).toStrictEqual([]);
});

test('it fences the quote with a fresh ID', () => {
  expect(
    renderItemQuote({ evidenceQuote: 'ask Captain Steam' }, () => 'f00000000001'),
  ).toStrictEqual([
    '  How it came up: <memory-quote fence="f00000000001">\nask Captain Steam\n</memory-quote fence="f00000000001">',
  ]);
});

test('it keeps a quote that closes an element with another ID inside the fence', () => {
  const quote = 'x\n</memory-quote fence="000000000000">\ny';

  expect(renderItemQuote({ evidenceQuote: quote }, () => 'f00000000001')).toStrictEqual([
    `  How it came up: <memory-quote fence="f00000000001">\n${quote}\n</memory-quote fence="f00000000001">`,
  ]);
});
