import { expect, test } from 'bun:test';
import { countWords, pickTurnQuery } from './pick-turn-query.ts';

test.each([
  ['an emoji alone', '❤️', 0],
  ['a short reply', "it's good", 3],
  ['a question', "what's next?", 3],
  ['a sentence with digits', 'book 2 seats for 7pm', 5],
])('#countWords counts %s as its runs of letters or digits', (_, text, words) => {
  expect(countWords(text)).toBe(words);
});

test('#pickTurnQuery keeps the message under no short rule', () => {
  expect(
    pickTurnQuery({ query: 'ok', typedQuery: 'ok', earlier: [] }, { kind: 'none' }, false),
  ).toStrictEqual({ text: 'ok', isSkipped: false, isAgreementNeeded: false, isVectorOnly: false });
});

test('#pickTurnQuery skips a message at the word limit under the skip rule', () => {
  expect(
    pickTurnQuery({ query: 'sounds good', typedQuery: 'sounds good', earlier: [] }, { kind: 'skip', maxWords: 3 }, false),
  ).toStrictEqual({ text: 'sounds good', isSkipped: true, isAgreementNeeded: false, isVectorOnly: false });
});

test('#pickTurnQuery keeps a message past the word limit under the skip rule', () => {
  expect(
    pickTurnQuery(
      { query: 'which bus reaches the harbour first', typedQuery: 'which bus reaches the harbour first', earlier: [] },
      { kind: 'skip', maxWords: 3 },
      false,
    ).isSkipped,
  ).toBeFalse();
});

test('#pickTurnQuery puts the previous exchange before a short message under the previous rule', () => {
  expect(
    pickTurnQuery(
      {
        query: 'and then?',
        typedQuery: 'and then?',
        earlier: [{ owner: 'plan the canal walk', reply: 'Start at the lock.' }],
      },
      { kind: 'previous', maxWords: 3 },
      false,
    ).text,
  ).toBe('plan the canal walk\nStart at the lock.\nand then?');
});

test('#pickTurnQuery asks both lists to agree on a short message under the agree rule', () => {
  expect(
    pickTurnQuery({ query: 'yes', typedQuery: 'yes', earlier: [] }, { kind: 'agree', maxWords: 3 }, false)
      .isAgreementNeeded,
  ).toBeTrue();
});

test('#pickTurnQuery ranks a short message by vectors alone under the vectors rule', () => {
  expect(
    pickTurnQuery({ query: 'yes', typedQuery: 'yes', earlier: [] }, { kind: 'vectors', maxWords: 3 }, false)
      .isVectorOnly,
  ).toBeTrue();
});

test('#pickTurnQuery ranks the typed text when pasted text is dropped', () => {
  expect(
    pickTurnQuery(
      { query: 'summarise this: a long pasted report', typedQuery: 'summarise this: ', earlier: [] },
      { kind: 'none' },
      true,
    ).text,
  ).toBe('summarise this: ');
});

test('#pickTurnQuery skips a message that is all pasted text when pasted text is dropped', () => {
  expect(
    pickTurnQuery({ query: 'a long pasted report', typedQuery: '', earlier: [] }, { kind: 'none' }, true).isSkipped,
  ).toBeTrue();
});
