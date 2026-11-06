import { expect, test } from 'bun:test';
import { pickTurnQuery } from './pick-turn-query.ts';

test('it keeps the message under no short rule', () => {
  expect(
    pickTurnQuery({ query: 'ok', typedQuery: 'ok', earlier: [] }, { kind: 'none' }, false),
  ).toStrictEqual({ text: 'ok', isSkipped: false, isAgreementNeeded: false, isVectorOnly: false });
});

test('it skips a message at the word limit under the skip rule', () => {
  expect(
    pickTurnQuery({ query: 'sounds good', typedQuery: 'sounds good', earlier: [] }, { kind: 'skip', maxWords: 3 }, false),
  ).toStrictEqual({ text: 'sounds good', isSkipped: true, isAgreementNeeded: false, isVectorOnly: false });
});

test('it keeps a message past the word limit under the skip rule', () => {
  expect(
    pickTurnQuery(
      { query: 'which bus reaches the harbour first', typedQuery: 'which bus reaches the harbour first', earlier: [] },
      { kind: 'skip', maxWords: 3 },
      false,
    ).isSkipped,
  ).toBeFalse();
});

test('it puts the previous exchange before a short message under the previous rule', () => {
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

test('it asks both lists to agree on a short message under the agree rule', () => {
  expect(
    pickTurnQuery({ query: 'yes', typedQuery: 'yes', earlier: [] }, { kind: 'agree', maxWords: 3 }, false)
      .isAgreementNeeded,
  ).toBeTrue();
});

test('it ranks a short message by vectors alone under the vectors rule', () => {
  expect(
    pickTurnQuery({ query: 'yes', typedQuery: 'yes', earlier: [] }, { kind: 'vectors', maxWords: 3 }, false)
      .isVectorOnly,
  ).toBeTrue();
});

test('it ranks the typed text when pasted text is dropped', () => {
  expect(
    pickTurnQuery(
      { query: 'summarise this: a long pasted report', typedQuery: 'summarise this: ', earlier: [] },
      { kind: 'none' },
      true,
    ).text,
  ).toBe('summarise this: ');
});

test('it adds the last user messages to a long message under a window rule', () => {
  expect(
    pickTurnQuery(
      {
        query: 'and what time does the market open on the weekend?',
        typedQuery: 'and what time does the market open on the weekend?',
        earlier: [
          { owner: 'thinking about Saturday', reply: 'Sounds good.' },
          { owner: 'the farmers market', reply: 'Which one?' },
        ],
      },
      { kind: 'window', messages: 1 },
      false,
    ).text,
  ).toBe('the farmers market\nand what time does the market open on the weekend?');
});

test('it adds no earlier message under a window of 0 messages', () => {
  expect(
    pickTurnQuery(
      {
        query: 'and what time does the market open on the weekend?',
        typedQuery: 'and what time does the market open on the weekend?',
        earlier: [
          { owner: 'thinking about Saturday', reply: 'Sounds good.' },
          { owner: 'the farmers market', reply: 'Which one?' },
        ],
      },
      { kind: 'window', messages: 0 },
      false,
    ).text,
  ).toBe('and what time does the market open on the weekend?');
});

test('it skips a message that is all pasted text when pasted text is dropped', () => {
  expect(
    pickTurnQuery({ query: 'a long pasted report', typedQuery: '', earlier: [] }, { kind: 'none' }, true).isSkipped,
  ).toBeTrue();
});
