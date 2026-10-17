import { expect, test } from 'bun:test';
import { updateDiscardedOutboxIDs } from './update-discarded-outbox-ids';

test('it adds a discarded message to the list every tab reads', () => {
  updateDiscardedOutboxIDs('8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70');

  expect(updateDiscardedOutboxIDs()).toStrictEqual(['8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70']);
});

test('it lists a message once when two tabs discard it', () => {
  updateDiscardedOutboxIDs('8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70');

  expect(updateDiscardedOutboxIDs('8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70')).toStrictEqual([
    '8b2d4f6a-0c1e-4a3b-9d5f-7e9a1c3b5d70',
  ]);
});

test('it keeps the 500 newest discards, dropping the oldest first', () => {
  const discarded = Array.from({ length: 501 }, (_, index) =>
    updateDiscardedOutboxIDs(`discarded-${index}`),
  ).at(-1);

  expect([discarded?.length, discarded?.at(0), discarded?.at(-1)]).toStrictEqual([
    500,
    'discarded-1',
    'discarded-500',
  ]);
});

test('it reads a list that does not parse as empty', () => {
  globalThis.localStorage.setItem('nixie.outbox.discarded', '{not json');

  expect(updateDiscardedOutboxIDs()).toStrictEqual([]);
});
