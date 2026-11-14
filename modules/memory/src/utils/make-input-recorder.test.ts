import { expect, test } from 'bun:test';
import { makeInputRecorder } from './make-input-recorder';

test('it leaves out the free-text arguments and keeps every other argument', () => {
  expect(
    makeInputRecorder(['text', 'quote'])({
      text: 'Allergic to hazelnuts',
      quote: "I'm allergic to hazelnuts",
      itemID: 'item-a',
      version: 2,
    }),
  ).toStrictEqual({ itemID: 'item-a', version: 2 });
});

test('it keeps an input that holds none of the free-text arguments whole', () => {
  expect(makeInputRecorder(['query'])({ itemIDs: ['item-a'], limit: 5 })).toStrictEqual({
    itemIDs: ['item-a'],
    limit: 5,
  });
});
